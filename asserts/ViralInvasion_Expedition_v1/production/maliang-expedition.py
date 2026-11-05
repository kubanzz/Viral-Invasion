"""Expedition v1 only. Standard Maliang CLI, durable run receipt, no blind replay."""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
CLI = Path(r'D:\project\xsj\SHJ-Product\项目大脑\工具箱\skills\maliang-skill\skills\maliang\scripts\maliang.py')
REG = ROOT/'production'/'runs.json'

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['submit','resume']);p.add_argument('ids',nargs='+');p.add_argument('--wait',type=int,default=0);p.add_argument('--namespace',default='');a=p.parse_args()
    global REG
    if a.namespace and (not a.namespace.replace('_','').isalnum()):raise RuntimeError('Unsafe namespace')
    production=ROOT/'production'/a.namespace
    REG=production/'runs.json'
    reg=json.loads(REG.read_text(encoding='utf-8')) if REG.exists() else {'schemaVersion':1,'runs':{}}
    catalog=json.loads((production/'prompt-catalog.json').read_text(encoding='utf-8'))
    for key in a.ids:
        old=reg['runs'].get(key)
        if a.operation=='submit':
            if old:
                print(json.dumps({'id':key,'status':'already-recorded','runId':old['runId']},ensure_ascii=False),flush=True);continue
            item=catalog['sources'][key]
            request={'prompt':item['prompt'],'original_request':'ViralInvasion_Expedition_v1 '+a.namespace+' '+key,'ratio':'1:1','resolution':'2K','settings':{'outputFormat':'png'},'count':1,'wait_seconds':a.wait,'poll_seconds':5,'folder_name':'项目大脑','brain_root':r'D:\project\xsj\SHJ-Product\项目大脑'}
            if reg.get('canvasId'):request['canvas']=reg['canvasId']
            else:request['create_canvas_title']='病毒入侵 · v0.15 心脏远征 · 2026-11-04 '+a.namespace
            for field in ['reference','style_reference','follow_up_run','follow_up_node']:
                if field in item:request[field]=item[field]
            op='generate'
        else:
            if not old:raise RuntimeError('Missing original run')
            request={'run_id':old['runId'],'wait_seconds':a.wait,'poll_seconds':5};op='runs'
        request_path=production/'requests'/(key+'.'+a.operation+'.json');save(request_path,request)
        cmd=[sys.executable,str(CLI),op]+(['resume'] if op=='runs' else [])+['--args-file',str(request_path)]
        result=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8')
        if not result.stdout.strip():
            print(result.stderr[-3000:],file=sys.stderr);raise SystemExit('CLI returned no receipt; inspect original request, do not replay')
        response=json.loads(result.stdout)
        if 'runId' not in response:
            print(json.dumps(response,ensure_ascii=False),flush=True);raise SystemExit(1)
        data=response.get('data',{})
        row={'runId':response['runId'],'status':data.get('status',response['status']),'responseStatus':response['status'],'manifestPath':response.get('manifestPath'),'canvas':data.get('canvas'),'images':response.get('images',[]),'storage':data.get('storage',{}),'prompt':catalog['sources'][key]['prompt'],'requestPath':str(request_path.relative_to(ROOT)),'referenceNodes':data.get('referenceNodes',[]),'followUpNodes':data.get('followUpNodes',[])}
        if row['canvas']:reg['canvasId']=row['canvas']['id']
        if row['status']=='succeeded':
            row['raw']=[]
            for image in row['images']:
                src=Path(image['path']);dest=ROOT/'raw'/a.namespace/key/(row['runId']+'.png');dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()!=image['sha256']:raise RuntimeError('Raw source immutable')
                if not dest.exists():shutil.copyfile(src,dest)
                row['raw'].append({'path':dest.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'nodeId':image['nodeId']})
        reg['runs'][key]=row;save(REG,reg)
        print(json.dumps({'id':key,'runId':row['runId'],'status':row['status'],'raw':row.get('raw',[]),'storage':row['storage']},ensure_ascii=False),flush=True)
        if row['status'] in ['submission_unknown','preparation_unknown']:raise SystemExit('Unknown external result, stop without replay')

if __name__=='__main__':main()
