# Собирает картинку превью ссылки assets/img/og-cover.jpg (1200×630). Запуск из папки assets: python3 ../tools/build_og.py
from PIL import Image, ImageFont, ImageDraw, ImageFilter
import math
W,H=1200,630
bg=Image.new('RGB',(W,H),(23,26,24))
# soft studio glow like the hero background
glow=Image.new('L',(W,H),0); g=ImageDraw.Draw(glow)
g.ellipse((560,250,1260,700),fill=60); glow=glow.filter(ImageFilter.GaussianBlur(120))
bg=Image.composite(Image.new('RGB',(W,H),(70,84,74)),bg,glow)
car=Image.open('img/hero-wide.webp')  # RGBA, 2400x1350
car=car.resize((int(2400*0.62),int(1350*0.62)),Image.LANCZOS)
bg.paste(car,(W-car.width+70,H-car.height+72),car)
d=ImageDraw.Draw(bg)
f=ImageFont.truetype('fonts/RobotoFlex-subset.woff',86)
axes=f.get_variation_axes(); names=[a['name'] for a in axes]
vals=[]
for a in axes:
    n=a['name'] if isinstance(a['name'],str) else a['name'].decode()
    vals.append({'Weight':460,'Width':151}.get(n,a['default']))
f.set_variation_by_axes(vals)
s=ImageFont.truetype('fonts/GolosText-subset.woff',22)
d.text((64,70),'FORME · DETAILING & PROTECTION',font=s,fill=(201,205,196),spacing=2)
d.text((60,118),'Поверхность',font=f,fill=(234,232,224))
d.text((60,212),'решает всё.',font=f,fill=(234,232,224))
d.rounded_rectangle((64,520,64+300,520+52),radius=26,fill=(215,243,106))
d.text((90,533),'Студия детейлинга · демо',font=ImageFont.truetype('fonts/GolosText-subset.woff',21),fill=(23,26,24))
bg.save('img/og-cover.jpg',quality=86,optimize=True,progressive=True)
print([ (a['name'],a['minimum'],a['default'],a['maximum']) for a in axes])
