package expo.modules.videoencoder

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.nio.ByteBuffer
import kotlin.concurrent.thread
import kotlin.math.max

class EncodeOptions : Record {
  @Field var outputPath: String = ""
  @Field var width: Int = 1080
  @Field var height: Int = 1080
  @Field var fps: Int = 8
  @Field var bitrate: Int = 6_000_000
}

class EncodeException(message: String) : CodedException("ERR_VIDEO_ENCODE", message, null)

class VideoEncoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoEncoder")
    Events("onProgress")

    AsyncFunction("encode") { frames: List<String>, options: EncodeOptions, promise: Promise ->
      thread(name = "video-encoder") {
        try {
          promise.resolve(encode(frames, options))
        } catch (e: Throwable) {
          promise.reject(EncodeException(e.message ?: e.toString()))
        }
      }
    }
  }

  private fun encode(frames: List<String>, o: EncodeOptions): Map<String, Any> {
    val out = File(o.outputPath)
    if (out.exists()) out.delete()
    out.parentFile?.mkdirs()

    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, o.width, o.height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, o.bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, o.fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()

    val muxer = MediaMuxer(o.outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var track = -1
    var muxerStarted = false
    val info = MediaCodec.BufferInfo()
    val frameUs = 1_000_000L / o.fps

    var lastPath = ""
    var lastBitmap: Bitmap? = null
    var scaled: Bitmap? = null

    fun drain(endOfStream: Boolean) {
      while (true) {
        val idx = codec.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
        when {
          idx == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
          idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            if (muxerStarted) throw EncodeException("출력 포맷이 두 번 바뀜")
            track = muxer.addTrack(codec.outputFormat)
            muxer.start(); muxerStarted = true
          }
          idx >= 0 -> {
            val buf = codec.getOutputBuffer(idx) ?: throw EncodeException("출력 버퍼 없음")
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
            if (info.size > 0) {
              if (!muxerStarted) throw EncodeException("muxer가 시작되지 않음")
              buf.position(info.offset); buf.limit(info.offset + info.size)
              muxer.writeSampleData(track, buf, info)
            }
            codec.releaseOutputBuffer(idx, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
          }
        }
      }
    }

    try {
      frames.forEachIndexed { i, raw ->
        val path = if (raw.startsWith("file://")) Uri.parse(raw).path ?: raw else raw
        val bmp = if (path == lastPath && lastBitmap != null) lastBitmap!! else {
          val b = BitmapFactory.decodeFile(path) ?: throw EncodeException("프레임을 읽을 수 없습니다: $path")
          lastPath = path; lastBitmap = b
          scaled?.recycle(); scaled = fitCenter(b, o.width, o.height)
          b
        }
        val frame = scaled ?: fitCenter(bmp, o.width, o.height).also { scaled = it }

        var inIdx: Int
        do { inIdx = codec.dequeueInputBuffer(10_000); if (inIdx < 0) drain(false) } while (inIdx < 0)
        val image = codec.getInputImage(inIdx) ?: throw EncodeException("입력 이미지 없음")
        fillYuv(frame, image)
        codec.queueInputBuffer(inIdx, 0, 0, i * frameUs, 0)
        drain(false)
        sendEvent("onProgress", mapOf("progress" to (i + 1).toDouble() / frames.size, "frame" to i + 1, "total" to frames.size))
      }
      var inIdx: Int
      do { inIdx = codec.dequeueInputBuffer(10_000); if (inIdx < 0) drain(false) } while (inIdx < 0)
      codec.queueInputBuffer(inIdx, 0, 0, frames.size * frameUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      drain(true)
    } finally {
      try { codec.stop() } catch (_: Throwable) {}
      codec.release()
      if (muxerStarted) { try { muxer.stop() } catch (_: Throwable) {} }
      muxer.release()
      scaled?.recycle(); lastBitmap?.recycle()
    }

    return mapOf(
      "uri" to Uri.fromFile(out).toString(),
      "frameCount" to frames.size,
      "durationMs" to (frames.size * 1000L / o.fps).toInt(),
      "bytes" to out.length().toInt(),
    )
  }

  /** aspect-fill로 목표 크기 비트맵 생성. 검은 배경. */
  private fun fitCenter(src: Bitmap, w: Int, h: Int): Bitmap {
    val dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(dst); c.drawColor(Color.BLACK)
    val scale = max(w.toFloat() / src.width, h.toFloat() / src.height)
    val dw = src.width * scale; val dh = src.height * scale
    val m = Matrix().apply { setScale(scale, scale); postTranslate((w - dw) / 2f, (h - dh) / 2f) }
    c.drawBitmap(src, m, null)
    return dst
  }

  /** ARGB 비트맵 → 코덱이 준 YUV420 Image 평면(플래너/세미플래너 모두 pixelStride로 처리). */
  private fun fillYuv(bmp: Bitmap, image: android.media.Image) {
    val w = bmp.width; val h = bmp.height
    val argb = IntArray(w * h); bmp.getPixels(argb, 0, w, 0, 0, w, h)
    val planes = image.planes
    val y = planes[0]; val u = planes[1]; val v = planes[2]
    val yBuf: ByteBuffer = y.buffer; val uBuf = u.buffer; val vBuf = v.buffer
    val crop = image.cropRect ?: Rect(0, 0, w, h)
    val cw = minOf(w, crop.width()); val ch = minOf(h, crop.height())

    for (row in 0 until ch) {
      val yRow = row * y.rowStride
      val cRowU = (row / 2) * u.rowStride
      val cRowV = (row / 2) * v.rowStride
      for (col in 0 until cw) {
        val p = argb[row * w + col]
        val r = (p shr 16) and 0xff; val g = (p shr 8) and 0xff; val b = p and 0xff
        // BT.601 limited range
        val yy = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
        yBuf.put(yRow + col * y.pixelStride, yy.coerceIn(0, 255).toByte())
        if (row % 2 == 0 && col % 2 == 0) {
          val uu = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
          val vv = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
          uBuf.put(cRowU + (col / 2) * u.pixelStride, uu.coerceIn(0, 255).toByte())
          vBuf.put(cRowV + (col / 2) * v.pixelStride, vv.coerceIn(0, 255).toByte())
        }
      }
    }
  }
}
