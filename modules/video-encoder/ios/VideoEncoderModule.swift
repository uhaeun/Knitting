import AVFoundation
import ExpoModulesCore
import UIKit

struct EncodeOptions: Record {
  @Field var outputPath: String = ""
  @Field var width: Int = 1080
  @Field var height: Int = 1080
  @Field var fps: Int = 8
  @Field var bitrate: Int = 6_000_000
}

enum EncodeError: Error, LocalizedError {
  case badFrame(String)
  case writer(String)
  case pixelBuffer

  var errorDescription: String? {
    switch self {
    case .badFrame(let p): return "프레임을 읽을 수 없습니다: \(p)"
    case .writer(let m): return "인코더 오류: \(m)"
    case .pixelBuffer: return "픽셀 버퍼를 만들 수 없습니다"
    }
  }
}

public class VideoEncoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoEncoder")
    Events("onProgress")

    AsyncFunction("encode") { (frames: [String], options: EncodeOptions, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try self.encode(frames: frames, options: options)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_VIDEO_ENCODE", error.localizedDescription)
        }
      }
    }
  }

  private func encode(frames: [String], options: EncodeOptions) throws -> [String: Any] {
    let outputURL = URL(fileURLWithPath: options.outputPath)
    try? FileManager.default.removeItem(at: outputURL)

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: options.width,
      AVVideoHeightKey: options.height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: options.bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: options.fps,
      ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: options.width,
        kCVPixelBufferHeightKey as String: options.height,
      ]
    )
    guard writer.canAdd(input) else { throw EncodeError.writer("입력을 추가할 수 없음") }
    writer.add(input)
    guard writer.startWriting() else {
      throw EncodeError.writer(writer.error?.localizedDescription ?? "startWriting 실패")
    }
    writer.startSession(atSourceTime: .zero)

    let timescale = CMTimeScale(options.fps)
    var lastPath = ""
    var lastImage: CGImage?

    for (i, raw) in frames.enumerated() {
      let path = raw.hasPrefix("file://") ? (URL(string: raw)?.path ?? raw) : raw
      let cg: CGImage
      if path == lastPath, let cached = lastImage {
        cg = cached
      } else {
        guard let ui = UIImage(contentsOfFile: path), let c = ui.cgImage else {
          throw EncodeError.badFrame(path)
        }
        cg = c
        lastPath = path
        lastImage = c
      }

      while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }

      guard let pool = adaptor.pixelBufferPool else { throw EncodeError.pixelBuffer }
      var pb: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
      guard let buffer = pb else { throw EncodeError.pixelBuffer }
      try draw(cg, into: buffer, width: options.width, height: options.height)

      let time = CMTime(value: CMTimeValue(i), timescale: timescale)
      if !adaptor.append(buffer, withPresentationTime: time) {
        throw EncodeError.writer(writer.error?.localizedDescription ?? "프레임 \(i) 추가 실패")
      }
      sendEvent("onProgress", ["progress": Double(i + 1) / Double(frames.count), "frame": i + 1, "total": frames.count])
    }

    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    if writer.status != .completed {
      throw EncodeError.writer(writer.error?.localizedDescription ?? "finishWriting 실패")
    }

    let bytes = (try? FileManager.default.attributesOfItem(atPath: options.outputPath)[.size] as? Int) ?? 0
    return [
      "uri": outputURL.absoluteString,
      "frameCount": frames.count,
      "durationMs": Int(Double(frames.count) * 1000.0 / Double(options.fps)),
      "bytes": bytes,
    ]
  }

  /** 이미지를 정사각/지정 크기에 맞춰 aspect-fill로 그린다. 세로가 뒤집히지 않게 좌표계를 뒤집는다. */
  private func draw(_ image: CGImage, into buffer: CVPixelBuffer, width: Int, height: Int) throws {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let ctx = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width, height: height, bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) else { throw EncodeError.pixelBuffer }

    ctx.setFillColor(UIColor.black.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

    let iw = CGFloat(image.width), ih = CGFloat(image.height)
    let scale = max(CGFloat(width) / iw, CGFloat(height) / ih)
    let dw = iw * scale, dh = ih * scale
    let rect = CGRect(x: (CGFloat(width) - dw) / 2, y: (CGFloat(height) - dh) / 2, width: dw, height: dh)
    ctx.draw(image, in: rect)
  }
}
