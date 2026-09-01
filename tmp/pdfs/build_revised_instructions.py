from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    PageBreak,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "Toy_Miniature_Catalogue_Instructions_Revised.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#202326")
MUTED = colors.HexColor("#666C72")
ACCENT = colors.HexColor("#E95B3D")
PALE = colors.HexColor("#F5F2EF")
RULE = colors.HexColor("#D9D5D1")


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.line(20 * mm, 15 * mm, PAGE_W - 20 * mm, 15 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 10 * mm, "TOY MINIATURE CATALOGUE - IMAGE STANDARD")
    canvas.drawRightString(PAGE_W - 20 * mm, 10 * mm, str(doc.page))
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=26, leading=30, textColor=INK, spaceAfter=9 * mm,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=12, leading=18, textColor=MUTED, spaceAfter=6 * mm,
))
styles.add(ParagraphStyle(
    name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=19, leading=23, textColor=INK, spaceBefore=2 * mm, spaceAfter=5 * mm,
))
styles.add(ParagraphStyle(
    name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=12, leading=15, textColor=ACCENT, spaceBefore=4 * mm, spaceAfter=2 * mm,
))
styles.add(ParagraphStyle(
    name="Bodyx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.7, leading=14.2, textColor=INK, spaceAfter=2.5 * mm,
))
styles.add(ParagraphStyle(
    name="Bulletx", parent=styles["Bodyx"], leftIndent=5 * mm,
    firstLineIndent=-3.5 * mm, bulletIndent=0, spaceAfter=1.3 * mm,
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["Bodyx"], fontName="Helvetica-Bold",
    fontSize=10.2, leading=15, textColor=INK, backColor=PALE,
    borderColor=ACCENT, borderWidth=0, borderPadding=10,
    leftIndent=3 * mm, rightIndent=3 * mm, spaceBefore=3 * mm, spaceAfter=5 * mm,
))
styles.add(ParagraphStyle(
    name="Small", parent=styles["Bodyx"], fontSize=8.6, leading=12, textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Kicker", parent=styles["Bodyx"], fontName="Helvetica-Bold",
    fontSize=9, leading=11, textColor=ACCENT, spaceAfter=3 * mm,
))
styles.add(ParagraphStyle(
    name="CenterSmall", parent=styles["Small"], alignment=TA_CENTER,
))


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullets(items):
    return [p(f"- {item}", "Bulletx") for item in items]


def section(title, body=None):
    out = [p(title, "H2x")]
    if body:
        out.append(p(body))
    return out


doc = BaseDocTemplate(
    str(OUTPUT), pagesize=A4,
    leftMargin=20 * mm, rightMargin=20 * mm,
    topMargin=19 * mm, bottomMargin=21 * mm,
    title="Toy Miniature Catalogue - Revised Project Instructions",
    author="Custom Minifig Collector",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates(PageTemplate(id="standard", frames=[frame], onPage=footer))

story = []
story += [Spacer(1, 25 * mm), p("PROJECT STANDARD", "Kicker")]
story += [p("Toy Miniature Catalogue", "CoverTitle")]
story += [p(
    "Instructions for transforming user photographs into consistent, archival-quality "
    "catalogue images while preserving the identity of each physical miniature.",
    "CoverSub",
)]
story += [Spacer(1, 7 * mm)]
story += [p(
    "This is an image editing, restoration, isolation, and standardization task. "
    "It is not a character redesign task and must not substitute the photographed object.",
    "Callout",
)]
story += [Spacer(1, 55 * mm)]
meta = Table([
    [p("OUTPUT", "Small"), p("1254 x 1254 PNG", "Small")],
    [p("CANVAS", "Small"), p("Transparent RGBA", "Small")],
    [p("SUBJECT", "Small"), p("The exact uploaded physical miniature", "Small")],
], colWidths=[35 * mm, 90 * mm])
meta.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE),
    ("GRID", (0, 0), (-1, -1), 0.4, RULE),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [meta, PageBreak()]

story += [p("1. Purpose and source of truth", "H1x")]
story += [p(
    "Act as an expert in archival imaging, museum collection photography, professional "
    "product photography, and photographic restoration. Transform each uploaded photograph "
    "into a standardized catalogue image of the same physical toy miniature.")]
story += [p(
    "The uploaded photograph is the only source of truth. Reference catalogue images may be "
    "used only to understand presentation style, framing, lighting, scale, and composition. "
    "They must never be used to replace, redesign, or reconstruct the subject.", "Callout")]
story += section("Primary objective", "Create a clean, consistent catalogue photograph suitable for an archival database. Every result should look as though it was photographed under the same controlled studio conditions, regardless of the quality of the source photograph.")

story += section("Identity preservation - highest priority")
story += bullets([
    "Preserve the exact head sculpt, facial printing, torso printing, leg printing, arm printing, molded parts, accessories, helmets, hair, cloth elements, weapons, backpacks, colors, proportions, surface finish, wear, and visible manufacturing details.",
    "Preserve authentic asymmetry. Do not mirror a distinctive arm, hand, print, accessory, damage mark, or color difference merely to make the figure look symmetrical.",
    "Do not improve the design, substitute parts, replace missing details from external references, or recreate the figure from memory.",
    "When information is uncertain, preserve ambiguity rather than inventing details.",
])

story += section("Permitted restoration")
story += bullets([
    "Correct exposure, white balance, brightness, contrast, color balance, sharpness, noise, lens distortion, and minor perspective distortion.",
    "Remove dust, fingerprints, sensor spots, table surfaces, supports, distracting reflections, unwanted shadows, and photographic artifacts.",
    "Restore the clarity of visible decoration without redrawing it or replacing it with a cleaner external version.",
])
story += [PageBreak()]

story += [p("2. Isolation and orientation", "H1x")]
story += section("Object isolation", "Remove everything except the featured miniature and its intended accessories.")
story += bullets([
    "Remove the entire original background and table or display surface.",
    "Remove neighboring toys, partial figures, hands, stands, supports, labels, and unrelated objects, including objects cut off by the frame edge.",
    "Keep every intended accessory attached to or clearly associated with the featured miniature.",
    "Do not crop weapons, staffs, shields, helmets, wings, capes, tails, backpacks, or effect pieces.",
])

story += section("Orientation")
story += [p(
    "If the figure already faces forward, maintain its orientation. If the figure is moderately "
    "rotated, normalize it to a front-facing catalogue view. Limited reconstruction of partially "
    "hidden geometry is permitted only when it can be reliably inferred from visible parts of the "
    "same uploaded photograph. Preserve all visible printing, colors, accessories, asymmetry, "
    "materials, wear, and manufacturing details. Never introduce details sourced from another "
    "figure or external reference. If a hidden area cannot be inferred reliably, preserve the "
    "closest authentic orientation instead.", "Callout")]
story += bullets([
    "Correct only the perspective needed to make the object upright and naturally front-facing.",
    "Do not force bilateral symmetry when the photographed object is genuinely asymmetric.",
    "Avoid exaggerated perspective, stretched parts, duplicated details, or geometry that looks generated rather than photographed.",
])

story += section("Composition")
story += bullets([
    "Use a precise 1:1 canvas measuring 1254 x 1254 pixels.",
    "Center the complete miniature horizontally and keep its vertical axis upright.",
    "Scale the miniature to approximately 88% of the image height.",
    "Place the lowest visible point of the miniature approximately 85 pixels above the bottom edge. This baseline rule takes precedence over perfectly equal top and bottom margins.",
    "Leave enough lateral clearance for the widest accessory or cloth element.",
])
story += [PageBreak()]

story += [p("3. Materials, decoration, and lighting", "H1x")]
story += section("Materials")
story += bullets([
    "Plastic must retain realistic plastic texture, gloss, molded edges, and reflections.",
    "Fabric must remain fabric. Cloth capes and garments must retain natural weave, thickness, folds, and irregularities.",
    "Transparent and translucent parts must preserve their real optical character.",
    "Do not convert photographed materials into CGI, illustration, painted texture, or perfectly smooth synthetic surfaces.",
])

story += section("Printed decoration")
story += bullets([
    "Preserve all visible printing exactly as photographed, including alignment, wear, small imperfections, and color differences.",
    "Improve legibility only where the source clearly supports the original mark or edge.",
    "Do not invent hidden printing, complete uncertain symbols, or replace decoration with artwork from a reference image.",
])

story += section("Color accuracy")
story += bullets([
    "Maintain accurate real-world colors and correct only photographic color casts.",
    "Do not increase saturation unnaturally or neutralize intentional differences between parts.",
    "Preserve subtle differences between opaque, translucent, painted, printed, metallic, and fabric surfaces.",
])

story += section("Lighting")
story += bullets([
    "Apply soft, diffuse, neutral, evenly distributed studio lighting to the subject.",
    "Maintain plausible plastic highlights and fabric shading.",
    "Avoid harsh shadows, blown highlights, deep black shadows, dramatic lighting, and flat textureless illumination.",
    "The final canvas has no visible white backdrop. The studio treatment describes the subject lighting only; all background pixels must be transparent.",
])
story += [PageBreak()]

story += [p("4. Output and quality control", "H1x")]
story += section("Required output")
requirements = [
    [p("Format", "Small"), p("PNG with an alpha channel (RGBA)", "Bodyx")],
    [p("Dimensions", "Small"), p("Exactly 1254 x 1254 pixels", "Bodyx")],
    [p("Background", "Small"), p("Fully transparent outside the subject; no white or colored fill", "Bodyx")],
    [p("Framing", "Small"), p("Complete subject, centered, approximately 88% image height, baseline approximately 85 px", "Bodyx")],
    [p("Style", "Small"), p("Realistic restored product photograph, never an illustration or CGI render", "Bodyx")],
]
tbl = Table(requirements, colWidths=[35 * mm, 120 * mm], repeatRows=0)
tbl.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.45, RULE),
    ("BACKGROUND", (0, 0), (0, -1), PALE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [tbl, Spacer(1, 4 * mm)]

story += section("Mandatory final inspection")
story += bullets([
    "Confirm that the output contains only the intended miniature and its accessories.",
    "Inspect the entire silhouette for halos, white fringes, gray residue, transparent streaks, horizontal smearing, rough masks, missing fabric, and clipped accessories.",
    "Confirm that the four canvas corners and all background areas are fully transparent.",
    "Confirm that facial, torso, arm, and leg printing still match the uploaded photograph.",
    "Confirm that asymmetric parts have not been mirrored, recolored, duplicated, or removed.",
    "Confirm that the result has no painterly rendering, CGI appearance, artificial texture, excessive smoothing, or over-sharpening.",
    "If frontal normalization creates unsupported details or obvious distortions, revert to the closest authentic orientation and clean that view instead.",
])

story += [p(
    "Guiding principle: improve the photographic presentation of the exact uploaded collectible. "
    "Do not reinterpret, redesign, substitute, or idealize it.", "Callout")]

story += section("Reference catalogue images")
story += [p(
    "Use provided catalogue examples only as references for photographic style, subject scale, "
    "framing, lighting, transparency, and composition. Do not copy their subjects, parts, prints, "
    "colors, or geometry into the uploaded miniature.")]

doc.build(story)
print(OUTPUT)
