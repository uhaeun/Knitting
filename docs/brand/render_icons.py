"""Export the app icons from the same paths as the app. Requires Pillow, reportlab and pypdfium2."""
import argparse
import json
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import pypdfium2
from PIL import Image, ImageChops, ImageDraw
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing, Group
from reportlab.graphics.svgpath import SvgPath
from reportlab.lib import colors

ROOT = Path(__file__).resolve().parents[2]
STROKES = json.loads((ROOT / 'src/shared/ui/journal-icons.json').read_text())
PALETTE = json.loads((ROOT / 'src/shared/ui/palette.json').read_text())


@lru_cache(maxsize=100)
def glyph(name, pixels, ink, stroke):
    units = 100 if name == 'brand' else 24
    drawing = Drawing(units, units)
    group = Group()
    group.translate(0, units)
    group.scale(1, -1)
    for path in STROKES[name]:
        group.add(SvgPath(path, fillColor=None, strokeColor=colors.black,
                          strokeWidth=stroke, strokeLineCap=1, strokeLineJoin=1))
    drawing.add(group)
    with pypdfium2.PdfDocument(BytesIO(renderPDF.drawToString(drawing))) as doc:
        bitmap = doc[0].render(scale=(pixels + 1) * 2 / units)
        mask = ImageChops.invert(bitmap.to_pil().convert('L')).resize((pixels, pixels), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', mask.size, ink)
    out.putalpha(mask)
    return out


def icon(pixels, fraction=0.99, transparent=False, round_mask=False):
    out = Image.new('RGBA', (pixels, pixels), (0, 0, 0, 0) if transparent else PALETTE['accent'])
    mark = glyph('brand', round(pixels * fraction), PALETTE['surface'], 5.4)
    inset = (pixels - mark.width) // 2
    out.alpha_composite(mark, (inset, inset))
    if round_mask:
        mask = Image.new('L', (pixels * 4, pixels * 4))
        ImageDraw.Draw(mask).ellipse((0, 0, mask.width - 1, mask.height - 1), fill=255)
        out.putalpha(mask.resize(out.size, Image.Resampling.LANCZOS))
    return out if transparent or round_mask else out.convert('RGB')


def export():
    for filename, pixels in [
        ('assets/images/icon.png', 1024), ('assets/images/favicon.png', 48),
        ('public/favicon.png', 48), ('public/icons/icon-192.png', 192),
        ('public/icons/icon-512.png', 512), ('public/icons/apple-touch-icon.png', 180),
        ('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024)
    ]:
        icon(pixels).save(ROOT / filename)
    icon(512, 0.70).save(ROOT / 'public/icons/maskable-512.png')

    for density, pixels in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        res = ROOT / f'android/app/src/main/res/mipmap-{density}'
        icon(pixels).save(res / 'ic_launcher.png')
        icon(pixels, 0.85, round_mask=True).save(res / 'ic_launcher_round.png')
        icon(pixels * 108 // 48, 0.54, transparent=True).save(res / 'ic_launcher_foreground.png')


def export_splashes():
    android = ROOT / 'android/app/src/main/res'
    ios = ROOT / 'ios/App/App/Assets.xcassets/Splash.imageset'
    for file in [*android.glob('drawable*/splash.png'), *ios.glob('*.png')]:
        with Image.open(file) as original:
            width, height = original.size
        # The iOS source is cropped to the device aspect ratio at launch.
        side = round(min(width, height) * (0.13 if file.parent == ios else 0.21))
        surface = Image.new('RGB', (width, height), PALETTE['bg'])
        mark = glyph('brand', side, PALETTE['accent'], 5.4)
        surface.paste(mark, ((width - side) // 2, (height - side) // 2), mark)
        surface.save(file)


def preview():
    board = Image.new('RGB', (792, 144), PALETTE['bg'])
    app = icon(112)
    mask = Image.new('L', (112, 112))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 111, 111), radius=24, fill=255)
    board.paste(app, (20, 16), mask)
    for i, name in enumerate(('calendar', 'feed', 'camera', 'explore', 'me')):
        mark = glyph(name, 54, PALETTE['ink'] if i == 0 else PALETTE['muted'], 2.1 if i == 0 else 1.65)
        board.paste(mark, (192 + i * 124, 43), mark.getchannel('A'))
    return board


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, help='optional directory for stand-alone logo exports')
    out = parser.parse_args().output
    if out:
        out.mkdir(parents=True, exist_ok=True)
        icon(1024).save(out / 'logo-icon.png')
        icon(1024, 0.70).save(out / 'logo-mask.png')
        icon(1024).save(out / 'logo-fav.png')
        preview().save(out / 'logo-preview.png')
    else:
        export()
        export_splashes()
        preview().save(ROOT / 'docs/brand/logo-preview.png')
