"""Technical black-matte separation and texture registration, no invented lightning pixels."""
from pathlib import Path
import json, hashlib
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def digest(b): return hashlib.sha256(b).hexdigest()
def save_png(path,im):
    p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);im.save(p,format='PNG',compress_level=9,optimize=True)
    b=p.read_bytes();return {'path':str(path).replace('\\','/'),'absolutePath':str(p),'sha256':digest(b),'bytes':len(b)}
def flatten(im,color):
    bg=Image.new('RGBA',im.size,color);bg.alpha_composite(im);return bg.convert('RGB')
def alpha_stats(im):
    a=im.getchannel('A');h=a.histogram();total=im.width*im.height
    border=sum(v>0 for v in list(a.crop((0,0,im.width,1)).getdata())+list(a.crop((0,im.height-1,im.width,im.height)).getdata())+list(a.crop((0,0,1,im.height)).getdata())+list(a.crop((im.width-1,0,im.width,im.height)).getdata()))
    hidden=sum(1 for r,g,b,a in im.getdata() if a==0 and (r or g or b))
    return {'transparent':h[0],'partial':sum(h[1:255]),'opaque':h[255],'hiddenRGB':hidden,'borderVisible':border,'meanAlpha':sum(i*n for i,n in enumerate(h))/total/255,'alphaAbove32Fraction':sum(h[33:])/total,'bbox':list(a.getbbox())}
def black_to_rgba(im,floor=6):
    values=[]
    for r,g,b in im.convert('RGB').getdata():
        d=[max(0,c-floor) for c in (r,g,b)];m=max(d)
        if not m:values.append((0,0,0,0));continue
        a=round(m*255/(255-floor))
        values.append(tuple(round(c*255/m) for c in d)+(a,))
    out=Image.new('RGBA',im.size);out.putdata(values);return out
def clear_hidden(im):
    values=[(r,g,b,a) if a else (0,0,0,0) for r,g,b,a in im.getdata()];im.putdata(values);return im

assets=[]
for key,path,size,anchor in [('cracks.v01','fx/electrified-cracks.png',(256,256),(128,128)),('trail.v01','fx/thunder-trail.png',(512,128),(256,64))]:
    receipt=json.loads((ROOT/'production/receipts'/f'{key}.json').read_text(encoding='utf-8'))
    assert receipt['status']=='succeeded'
    raw=receipt['raw'][0];source=Path(raw['path']);source_bytes=source.read_bytes();assert digest(source_bytes)==raw['sha256']
    original=Image.open(source).convert('RGBA');rgba=black_to_rgba(original)
    high=save_png(f'production/{key.split(".")[0]}-qa/source-transparent.png',rgba)
    W,H=rgba.size
    if key.startswith('cracks'):
        crop=(0,0,W,H)
    else:
        # Texture canvas is intentionally reshaped vertically for its stretch-along-path use.
        bbox=rgba.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox()
        crop=(0,max(0,bbox[1]-24),W,min(H,bbox[3]+24))
    im=clear_hidden(rgba.crop(crop).resize(size,Image.Resampling.LANCZOS))
    out=save_png(path,im);stat=alpha_stats(im)
    assert stat['transparent']>0 and stat['partial']>0 and stat['hiddenRGB']==0 and stat['borderVisible']==0
    stem=key.split('.')[0];qa={}
    for name,color in [('black','#101714'),('cream','#fff7e5')]:qa[name]=save_png(f'production/{stem}-qa/{name}.png',flatten(im,color))
    pair=Image.new('RGB',(size[0]*2,size[1]),'#fff7e5');pair.paste(flatten(im,'#101714'),(0,0));pair.paste(flatten(im,'#fff7e5'),(size[0],0))
    qa['blackCream']=save_png(f'production/{stem}-qa/black-cream.png',pair)
    widths=[32,64,128] if stem=='cracks' else [128,256,512]
    preview=Image.new('RGB',(max(widths)*2,sum(round(w*size[1]/size[0]) for w in widths)),'#fff7e5');y=0
    for w in widths:
        h=round(w*size[1]/size[0]);small=im.resize((w,h),Image.Resampling.LANCZOS)
        preview.paste(flatten(small,'#101714'),(0,y));preview.paste(flatten(small,'#fff7e5'),(max(widths),y));y+=h
    qa['actualSizes']=save_png(f'production/{stem}-qa/actual-sizes.png',preview)
    sx=size[0]/(crop[2]-crop[0]);sy=size[1]/(crop[3]-crop[1])
    assets.append({'key':'thunder.'+('electrified-cracks' if stem=='cracks' else 'trail'),'id':'thunder25.'+('electrifiedCracks' if stem=='cracks' else 'trail'),'kind':'effect-overlay' if stem=='cracks' else 'stretchable-path-texture','runtime':True,**out,'dimensions':list(size),'channels':4,'foot':list(anchor),'anchor':list(anchor),'pivot':[.5,.5],'trim':False,'alphaBounds':stat.pop('bbox'),'alpha':stat,
       'registration':{'method':'full-source-scaled-to-square' if stem=='cracks' else 'horizontal-texture-full-width-with-vertical-content-crop-and-resize','sourceDimensions':[W,H],'sourceCrop':[crop[0],crop[1],crop[2]-crop[0],crop[3]-crop[1]],'scale':[sx,sy],'matrixFullSourceToRuntime':[[sx,0,-crop[0]*sx],[0,sy,-crop[1]*sy],[0,0,1]],'targetCanvas':list(size),'targetAnchor':list(anchor),'anchorMeaning':'texture center; not a world ground-foot','trim':False},
       'source':{'path':str(source.relative_to(ROOT)).replace('\\','/'),'sha256':raw['sha256'],'bytes':len(source_bytes),'dimensions':[W,H],'runId':receipt['runId'],'nodeId':raw['nodeId'],'canvasId':receipt['canvas']['id'],'model':receipt['images'][0]['model'],'prompt':receipt['sourcePrompt'],'storage':receipt['images'][0].get('storage'),'receiptPath':f'production/receipts/{key}.json'},
       'transparency':{'nativeTransparency':False,'method':'technical-black-matte-to-soft-alpha','neutralBlackFloor':6,'formula':'d=max(0,sourceRGB-6); alpha=max(d)/249; straightRGB=d/max(d). Fully transparent RGB zeroed after resize.','whiteElectricCorePreserved':True,'binaryAlpha':False,'sourceTransparentHires':high},
       'compression':{'method':'Pillow losslessRGBA PNG compression9 optimize','storedColorType':6,'palette':False,'colorQuantization':False},'qa':qa,'status':'producer-reviewed-awaiting-root-review'})

fragment={'schemaVersion':1,'theme':'ViralInvasion_ThunderRework_v025','status':'producer-ready','expectedRuntimeCount':2,'assets':assets,'metadata':{'runtimeCount':2,'runtimePngBytes':sum(a['bytes'] for a in assets),'sourceMethod':'Two actual Seedream5Pro images; technical black-background alpha separation and texture resize. No procedurally invented lightning.','rawAndQaExcludedFromBudget':True,'centerAnchors':True,'noGameChanges':True}}
(ROOT/'production/overlays.fragment.json').write_text(json.dumps(fragment,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'producer-ready','runtimePngBytes':fragment['metadata']['runtimePngBytes'],'assets':[{k:a[k] for k in ['path','sha256','bytes','dimensions','alphaBounds','alpha']} for a in assets]},ensure_ascii=False))
