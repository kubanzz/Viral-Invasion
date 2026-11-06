import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const host='127.0.0.1',port=Number(process.env.PLAYER_VIEWER_PORT||5188);
const mime={'.html':'text/html; charset=utf-8','.glb':'model/gltf-binary','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://${host}:${port}`);
  let target;
  if(url.pathname==='/probe.glb')target=resolve(root,'../tripo-studio-export/h25-robot-static.glb');
  else if(url.pathname==='/hero.glb')target=resolve(root,'../../asserts/ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb');
  else{const local=decodeURIComponent(url.pathname==='/'?'/dist/viewer.html':url.pathname);target=resolve(root,`.${local}`);const rel=relative(root,target);if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Invalid path');}
  const data=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':data.byteLength});res.end(data);
}catch(error){res.writeHead(error.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.code==='ENOENT'?'文件不存在':error.message);}});
server.listen(port,host,()=>console.log(`Player viewer: http://${host}:${port}/\nStatic probe only: http://${host}:${port}/?probe=1`));
