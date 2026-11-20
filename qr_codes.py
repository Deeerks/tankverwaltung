"""Generate two QR codes after the public deployment URL is known."""
import sys
from pathlib import Path
from urllib.parse import urlsplit
try:
    import qrcode
    from reportlab.pdfgen import canvas
except ImportError:
    sys.exit('Install: pip install "qrcode[pil]" reportlab')
if len(sys.argv)!=2:
    sys.exit('Usage: python qr_codes.py https://your-public-app.example')
base=sys.argv[1].rstrip('/')
parts=urlsplit(base)
if parts.scheme!='https' or not parts.netloc:
    sys.exit('Use the final public HTTPS URL.')
out=Path('qr-output');out.mkdir(exist_ok=True)
entries=[('Doppelachser','doppelachser'),('Einachser','einachser')]
pdf=canvas.Canvas(str(out/'Tank_QR_Codes.pdf'),pagesize=(595,842))
for i,(name,slug) in enumerate(entries):
    link=f'{base}/?tank={slug}'
    img=qrcode.make(link)
    img.save(out/f'{slug}.png')
    y=680-i*390
    pdf.setFont('Helvetica-Bold',24);pdf.drawString(60,y+90,name)
    pdf.drawImage(str(out/f'{slug}.png'),60,y-170,width=240,height=240)
    pdf.setFont('Helvetica',10);pdf.drawString(60,y-185,link)
pdf.save()
print('QR PNGs and printable PDF created in qr-output/')
