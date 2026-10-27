import { deflateRawSync, inflateRawSync } from 'node:zlib';
const table=Array.from({length:256},(_,i)=>{let n=i;for(let bit=0;bit<8;bit++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=raw=>{let n=0xffffffff;for(const byte of raw)n=table[(n^byte)&255]^(n>>>8);return(n^0xffffffff)>>>0;};

/** Small standard ZIP, fixed five ASCII member names, DEFLATE and CRC32. */
export function createZip(entries){
  const locals=[],directory=[];let offset=0;
  for(const [name,raw] of entries){
    if(!/^[A-Za-z0-9.-]+$/.test(name))throw Error(`Unexpected archive name: ${name}`);
    const filename=Buffer.from(name,'utf8'),compressed=deflateRawSync(raw,{level:9}),crc=crc32(raw);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(filename.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    locals.push(header,filename,compressed);directory.push(central,filename);offset+=header.length+filename.length+compressed.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}

/** Validate and extract our bounded five-file ZIP without executing its files. */
export function readZip(raw,allowed){
  const end=raw.length-22;if(end<0||raw.readUInt32LE(end)!==0x06054b50||raw.readUInt16LE(end+20)!==0)throw Error('Unsupported ZIP ending.');
  const count=raw.readUInt16LE(end+10),directorySize=raw.readUInt32LE(end+12),directoryOffset=raw.readUInt32LE(end+16);
  if(count!==allowed.length||raw.readUInt16LE(end+8)!==count||directoryOffset+directorySize!==end)throw Error('Unexpected ZIP directory or member count.');
  const output=new Map();let at=directoryOffset;
  for(let i=0;i<count;i++){
    if(raw.readUInt32LE(at)!==0x02014b50)throw Error('Invalid central ZIP entry.');
    const flags=raw.readUInt16LE(at+8),method=raw.readUInt16LE(at+10),crc=raw.readUInt32LE(at+16),packed=raw.readUInt32LE(at+20),size=raw.readUInt32LE(at+24);
    const nameLength=raw.readUInt16LE(at+28),extra=raw.readUInt16LE(at+30),comment=raw.readUInt16LE(at+32),localOffset=raw.readUInt32LE(at+42);
    const name=raw.subarray(at+46,at+46+nameLength).toString('utf8');
    if(!allowed.includes(name)||output.has(name)||flags!==0x800||method!==8||size>16*1024*1024||raw.readUInt32LE(localOffset)!==0x04034b50)throw Error(`Unsupported or duplicate ZIP member: ${name}`);
    const localName=raw.readUInt16LE(localOffset+26),localExtra=raw.readUInt16LE(localOffset+28),start=localOffset+30+localName+localExtra;
    if(start+packed>directoryOffset||raw.subarray(localOffset+30,localOffset+30+localName).toString('utf8')!==name)throw Error('ZIP member exceeds its data region.');
    const content=inflateRawSync(raw.subarray(start,start+packed),{maxOutputLength:16*1024*1024});
    if(content.length!==size||crc32(content)!==crc)throw Error(`ZIP length/CRC mismatch: ${name}`);
    output.set(name,content);at+=46+nameLength+extra+comment;
  }
  if(at!==end||output.size!==allowed.length)throw Error('ZIP directory validation incomplete.');
  return output;
}
