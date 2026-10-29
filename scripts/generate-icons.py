"""Render the app icon as sharp artwork for Windows and the web."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PUBLIC = ROOT / "public"
BASE = 1024

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="16" y="16" width="992" height="992" rx="218" fill="#101215"/>
  <rect x="20" y="20" width="984" height="984" rx="214" fill="none" stroke="#30363c" stroke-width="8"/>
  <rect x="140" y="174" width="744" height="676" rx="72" fill="#202428" stroke="#f5f7f8" stroke-width="22"/>
  <path d="M165 310h694" stroke="#444a50" stroke-width="8"/>
  <circle cx="235" cy="242" r="24" fill="#ff6b6e"/>
  <circle cx="310" cy="242" r="24" fill="#f5cf4f"/>
  <circle cx="385" cy="242" r="24" fill="#24e377"/>
  <path d="M361 440 250 555 361 670M663 440l111 115-111 115" fill="none" stroke="#f8fafb" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="407" y="505" width="34" height="100" rx="17" fill="#20e779"/>
  <rect x="451" y="467" width="34" height="176" rx="17" fill="#20e779"/>
  <rect x="495" y="423" width="34" height="264" rx="17" fill="#20e779"/>
  <rect x="539" y="467" width="34" height="176" rx="17" fill="#20e779"/>
  <rect x="583" y="505" width="34" height="100" rx="17" fill="#20e779"/>
</svg>
'''


def render(size: int) -> Image.Image:
    # Draw each small ICO frame independently, with thicker strokes for legibility.
    supersample = 8 if size <= 48 else 4 if size <= 512 else 2
    scale = size * supersample / BASE
    canvas = Image.new("RGBA", (size * supersample,) * 2, (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def point(x, y):
        return round(x * scale), round(y * scale)

    def box(left, top, right, bottom):
        return (*point(left, top), *point(right, bottom))

    def stroke(points, color, width):
        coords = [point(x, y) for x, y in points]
        thickness = round(width * scale)
        draw.line(coords, fill=color, width=thickness, joint="curve")
        radius = thickness / 2
        for x, y in (coords[0], coords[-1]):
            draw.ellipse((round(x - radius), round(y - radius), round(x + radius), round(y + radius)), fill=color)

    draw.rounded_rectangle(box(16, 16, 1008, 1008), radius=round(218 * scale), fill="#101215")
    draw.rounded_rectangle(box(20, 20, 1004, 1004), radius=round(214 * scale), outline="#30363c", width=max(1, round(8 * scale)))

    if size <= 64:
        # Windows taskbar icons are tiny: keep the same code and waveform mark,
        # but remove the terminal chrome that would blur at 16–64 pixels.
        stroke(((350, 330), (195, 512), (350, 694)), "#f8fafb", 96)
        stroke(((674, 330), (829, 512), (674, 694)), "#f8fafb", 96)
        for x, top, bottom in ((434, 425, 599), (512, 348, 676), (590, 425, 599)):
            draw.rounded_rectangle(box(x - 31, top, x + 31, bottom), radius=round(31 * scale), fill="#20e779")
        return canvas.resize((size, size), Image.Resampling.LANCZOS)

    draw.rounded_rectangle(box(140, 174, 884, 850), radius=round(72 * scale), fill="#202428", outline="#f5f7f8", width=round(22 * scale))
    draw.line((*point(165, 310), *point(859, 310)), fill="#444a50", width=max(1, round(8 * scale)))

    for x, color in ((235, "#ff6b6e"), (310, "#f5cf4f"), (385, "#24e377")):
        draw.ellipse(box(x - 24, 218, x + 24, 266), fill=color)

    stroke(((361, 440), (250, 555), (361, 670)), "#f8fafb", 54)
    stroke(((663, 440), (774, 555), (663, 670)), "#f8fafb", 54)
    bars = ((424, 505, 605), (468, 467, 643), (512, 423, 687), (556, 467, 643), (600, 505, 605))
    bar_width = 34
    for x, top, bottom in bars:
        draw.rounded_rectangle(box(x - bar_width / 2, top, x + bar_width / 2, bottom), radius=round(bar_width / 2 * scale), fill="#20e779")

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    PUBLIC.mkdir(exist_ok=True)
    (ASSETS / "app-icon.svg").write_text(SVG, encoding="utf-8")
    (PUBLIC / "favicon.svg").write_text(SVG, encoding="utf-8")
    render(2048).save(ASSETS / "app-icon-master.png", optimize=True)

    for size in (16, 32, 44, 192, 512):
        render(size).save(PUBLIC / f"icon-{size}.png", optimize=True)

    sizes = (16, 24, 32, 48, 64, 128, 256)
    frames = [render(size) for size in sizes]
    for name in ("app-dev.ico", "app-dev-v6.ico", "favicon.ico", "favicon-v6.ico"):
        frames[-1].save(PUBLIC / name, format="ICO", sizes=[(size, size) for size in sizes], append_images=frames[:-1])


if __name__ == "__main__":
    main()
