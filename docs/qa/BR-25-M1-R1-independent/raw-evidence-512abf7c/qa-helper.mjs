import {ClassicLevel} from 'classic-level';
const db=new ClassicLevel(process.argv[3],{createIfMissing:false,compression:false});await db.open();
if(process.argv[2]==='sst'){await db.put('independent-sst-key',JSON.stringify({name:'SST original sentinel',type:'item'}));await db.compactRange(Buffer.alloc(0),Buffer.from([255,255,255]));await db.close();}
else {console.log('READY');process.stdin.resume();process.stdin.on('data',async()=>{await db.close();process.exit(0)});}
