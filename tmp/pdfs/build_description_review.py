from pathlib import Path
import json
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

root=Path.cwd()
rows=json.loads(Path("/private/tmp/osp-description-review.json").read_text())
pdfmetrics.registerFont(TTFont("ReviewArial","/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("ReviewArialBold","/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
ink=colors.HexColor("#202823"); green=colors.HexColor("#344834"); rule=colors.HexColor("#a4aaa3")
body=ParagraphStyle("Body",fontName="ReviewArial",fontSize=10,leading=13,textColor=ink,spaceAfter=0)
name=ParagraphStyle("Name",parent=body,fontName="ReviewArialBold",fontSize=10.2,leading=13)
small=ParagraphStyle("Small",parent=body,fontSize=8.3,leading=11,textColor=colors.HexColor("#555c55"))
head=ParagraphStyle("Head",parent=body,fontName="ReviewArialBold",textColor=colors.white,fontSize=10.5,leading=13)
title=ParagraphStyle("Title",parent=name,fontSize=19,leading=23,spaceAfter=8)
intro=ParagraphStyle("Intro",parent=body,fontSize=9.5,leading=13,spaceAfter=7)

def para(t,style=body):return Paragraph(escape(t),style)

class NumberedCanvas(canvas.Canvas):
    def __init__(self,*a,**kw):super().__init__(*a,**kw);self.states=[]
    def showPage(self):self.states.append(dict(self.__dict__));self._startPage()
    def save(self):
        count=len(self.states)
        for state in self.states:
            self.__dict__.update(state)
            self.setStrokeColor(rule);self.setLineWidth(.45);self.line(36,32,756,32)
            self.setFont("ReviewArial",8);self.setFillColor(colors.HexColor("#535b54"))
            self.drawString(36,20,"OSP House Rules | Item description review | 16 October 2026")
            self.drawRightString(756,20,f"Page {self._pageNumber} of {count}")
            super().showPage()
        super().save()

out=root/"output/pdf/osp-item-description-review.pdf"
doc=SimpleDocTemplate(str(out),pagesize=landscape(letter),rightMargin=36,leftMargin=36,topMargin=30,bottomMargin=43,title="OSP House Rules - Item Description Review",author="OSP House Rules",allowSplitting=1)
story=[para("Item description review",title),para("73 proposed revisions to preserve the default card image size",name),Spacer(1,7),para("Current descriptions are reproduced from the local equipment catalogs. The new descriptions are proposals for review; no item records have been changed.",intro),para("Fit check: each proposal uses no more than five lines in the current card renderer (36 px Handwritten, 480 px text width, 40 px line spacing). Six lines fit without shrinking the prior default image; every proposal therefore has at least one line of margin. Custom Foundry items are outside this review.",intro),Spacer(1,5)]
data=[[para("Item",head),para("Current description",head),para("Proposed shorter description",head)]]
for o in rows:
    label=para("{:02d}. {}".format(o["id"],o["name"]),name)
    category=para(o["catalog"].capitalize(),small)
    data.append([[label,Spacer(1,4),category],para(o["current"]),para(o["proposed"])])
t=LongTable(data,colWidths=[110,330,280],repeatRows=1,hAlign="LEFT",splitByRow=1)
t.setStyle(TableStyle([
("BACKGROUND",(0,0),(-1,0),green),("VALIGN",(0,0),(-1,-1),"TOP"),
("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),
("TOPPADDING",(0,0),(-1,0),9),("BOTTOMPADDING",(0,0),(-1,0),9),
("TOPPADDING",(0,1),(-1,-1),9),("BOTTOMPADDING",(0,1),(-1,-1),10),
("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f2f4f0")]),
("LINEBELOW",(0,0),(-1,0),.6,green),("LINEBELOW",(0,1),(-1,-1),.4,rule),
("LINEAFTER",(0,0),(1,-1),.4,rule),
]))
story.append(t)
doc.build(story,canvasmaker=NumberedCanvas)
reader=PdfReader(out)
text=" ".join(p.extract_text() for p in reader.pages)
normalized=" ".join(text.split())
for o in rows:
    for field in ["current","proposed"]:
        assert " ".join(o[field].split()) in normalized,(o["id"],field)
assert len(rows)==73 and len({o["name"] for o in rows})==73
print(f"Created {out}; {len(reader.pages)} landscape Letter pages; all 146 descriptions verified in PDF text.")
