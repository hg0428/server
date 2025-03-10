// globals.js
//1

//Game version
const VERSION = 2
//Number of servers
const SERVERCOUNT = 1n
//App bundle ID
const bundleId = "locus.tunnelvision"
//Helpful modules
const crypto = require("crypto")
const dgram = require('dgram')
//UDP server
const server = dgram.createSocket('udp4')

//Private key for signing userdata requests
const PRIVATE_KEY = fs.readFileSync(".i", "utf-8")

let suffixes = { //multipliers
  ms: 0.001, //millisecond
  s: 1, //second
  m: 60, //minute
  h: 3600, //hour
  d: 86400, //day
  K: 1000, //thousand
  k: 1000, //also thousand
  M: 1000000, //million
  "%": 0.01 //percent
}

const missionStats = {
  travel: readfile("behaviour/missions/travel"),
  planets: readfile("behaviour/missions/planets"),
  destroy: readfile("behaviour/missions/destroy"), //destroy asteroids
  steal: readfile("behaviour/missions/steal"), //steal (destroy) planets
  build: readfile("behaviour/missions/build"), //coloItems
  drill: readfile("behaviour/missions/drill"), //upgrade to lvl
  canon: readfile("behaviour/missions/canon"), //upgrade to lvl
  kills: readfile("behaviour/missions/kills"),
  energy: readfile("behaviour/missions/energy"),
  research: readfile("behaviour/missions/research"),
  gems: readfile("behaviour/missions/gems"),
  flybys: readfile("behaviour/missions/flybys"),
  visit: readfile("behaviour/missions/visit"),
}
let missions = Object.keys(missionStats)


const PLAYERDATA = { //Default player data
  bal: 10e6, bal2: 5000, gems: 10e3, lvl: 1, xp: 0,
  stats: {travel: 0, planets: 0},
  missions: null,
  missionlvls: {},
  adcd: 0
}

const PI256 = Math.PI / 128

//Fast trigs
const sin = Array.from({length: 256}, (_, i) => Math.sin(i * PI256))
//usage: sin[angle * PI256 & 255]
//or cos: sin[angle * PI256 + 64 & 255]

//updates every frame
let NOW = Math.floor(Date.now() / 1000)
//[string remote: ClientData]
const clients = new Map()
//[int: ClientData]
const clientKeys = []
//increment counter for clientKeys
let clientI = 0
const FPS = 60
//Gravitational constant
const G = 0.0001
//size of a REGION
const REGIONSIZE = 500000
//Object representing an object that doesn't exist (a bit like null)
const EMPTY = {toBuf(a){a.int(0);a.int(0);a.int(0);a.int(0)},updatep(thing){},update(){}}
//Sector
let sector = {objects:[],planets:[],time:0,w:0,h:0}

//behaviour files
const ships = readfile('behaviour/ships')
const asteroids = readfile('behaviour/asteroids')
const itemMeta = readfile("behaviour/items")
const ITEMS = itemMeta.map(a => readfile("behaviour"+a.path))

const damages = ships.map(ship => (ship.shootdmgs+"").split(",").map(a => +a.trim()).reduce((a, b) => a + b))

//performance variables
const {performance} = require('perf_hooks')
let lidle = performance.eventLoopUtilization().idle
let lactive = performance.eventLoopUtilization().active



//Modules that might need downloading
let fetch, verify, Buf, BufWriter, TYPES

try{fetch = require('node-fetch')}catch(e){
  console.log("\x1b[31m[Error]\x1b[37m To run this server, you need to install node-fetch 2.6.2. Type this in the bash shell: \x1b[m\x1b[34mnpm i node-fetch@2.6.2\x1b[m")
  process.exit(1)
}
try{({Buf, BufWriter, TYPES} = require('buf.js'))}catch(e){
  console.log("\x1b[31m[Error]\x1b[37m To run this server, you need to install buf.js. Type this in the bash shell: \x1b[m\x1b[34mnpm i buf.js\x1b[m")
  process.exit(1)
}
try{verify = require("gamecenter-identity-verifier").verify}catch(e){
  console.log("\x1b[31m[Error]\x1b[37m To run this server, you need to install gamcecenter-identity-verifier. Type this in the bash shell: \x1b[m\x1b[34mnpm i gamecenter-identity-verifier\x1b[m")
  process.exit(1)
}

try{RESPONSE = null;require('basic-repl')('$',v=>([RESPONSE,RESPONSE=null][0]||_)(v))}catch(e){
  console.log("\x1b[33m[Warning]\x1b[37m If you would like to manage this server from the console, you need to install basic-repl. Type this in the bash shell: \x1b[m\x1b[34mnpm i basic-repl\x1b[m")
}




//Unsaved planet data
const unsaveds = {}
setInterval(function(){
  for(a in unsaveds){
    fs.writeFileSync(a, JSON.stringify(unsaveds[a]))
    delete unsaveds[a]
  }
}, 3e5)

// data.js
//2

//Fetch user data
//usage: fetchdata(id: string): Promise<Object>
//example: let userdata = await fetchdata(playerId)
function fetchdata(id){
  return new Promise(r => {
    //for now we only get user data from local files
    //this is faster and more convenient than, for example, SQL or some 3rd party hosted database
    fs.readFile("users/" + id, {}, function(err, dat){
      if(err)return r({}) //If no file, then send empty object
      try{
        r(JSON.parse(dat)) //send data
      }catch(_){ //we dont care about error
        r({}) //send empty object
      }
    })
  })
}
//Read GameData file
//example: let ships = readfile("behaviour/ships")
function readfile(path){
  let text
  try{text = fs.readFileSync(path)+''}catch(e){return null}
  text = text.split('\n').map(a=>a.replace(/#.*/,''))
  let i = 0
  let arr = []
  while(i < text.length){
    arr.push({})
    while(text[i]){
      let t = text[i].split(':')
      t[1] = t.slice(1).join(':').split("#")[0]
      if(!t[1]){i++;continue}
      t[1] = t[1].trim()
      let p = suffixify(t[1])
      if(t[1] == "true" || t[1] == "yes")t[1] = true
      else if(t[1] == "false" || t[1] == "no")t[1] = false
      else if(p == p)t[1] = p
      arr[arr.length-1][t[0]]=t[1]
      i++
    }
    i++
  }
  return arr
}


//usage: suffixify(str: string): number
//example: suffixify("30m") == 1800
function suffixify(str){
  let m = str.match(/^(-?(?:\d+\.\d*|\.?\d+)(?:e[+-]?\d+)?)([a-zA-Z%]*)$/)
  if(!m)return NaN
  return m[1] * (suffixes[m[2]] || 1)
}

// setup.js
//3
//It aint broke so dont fix it
function _(_){
    let __ = (_.match(/"[^"]*"|'[^']*'|\S+/g)||[]).map(a => a[0]=="'"||a[0]=='"'?a.slice(1,-1):a)
    if(__[0] && FUNCS[__[0]])return FUNCS[__[0]](...__.slice(1))
    return eval(_)
}
let meta = (readfile('meta')||[]).find(a=>(a.port||a.ip.split(":")[1])==process.argv[2]) || null
let xy = (process.argv[3]||"_NaN_NaN").slice(1).split("_").map(a=>+a)
if(xy[0] != xy[0] || xy[1] != xy[1])xy=null
if(process.argv[2] && !xy && !meta){process.exit(0)}
if(!meta || xy){
    if(typeof RESPONSE == "undefined")console.log("\x1b[31m[Error]\x1b[37m To set up this server, you need to install basic-repl. Type this in the bash shell: \x1b[m\x1b[34mnpm i basic-repl\x1b[m"),process.exit(0)
    console.log("Enter sector \x1b[33mX\x1b[m:")
    let x;
    function _w(X){
        if(+X != +X)return console.log("Enter sector \x1b[33mX\x1b[m:"),RESPONSE=_w
        x = X
        console.log("Enter sector \x1b[33mY\x1b[m:")
        RESPONSE = _v
        return '\x1b[1A'
    }
    function _v(y){
        if(+y != +y)return console.log("Enter sector \x1b[33mY\x1b[m:"),RESPONSE=_v
        //x, y
        let rx = Math.floor(x / REGIONSIZE)
        let ry = Math.floor(y / REGIONSIZE)
        console.log('Downloading region file...')
        let a = null
        try{
            a = fs.readFileSync('region_'+rx+'_'+ry+'.region')
        }catch(e){
        fetch('https://raw.githubusercontent.com/BlobTheKat/data/master/'+rx+'_'+ry+'.region').then(a=>a.buffer()).then(a=>{
            fs.writeFileSync('region_'+rx+'_'+ry+'.region', a)
            done(a)
        })}
        if(a)done(a)
        function done(dat){
            console.log('Parsing region')
            let sx, sy, w, h
            let i = 0
            while(true){
                sx = dat.readInt16LE(i) * 1000 + rx * REGIONSIZE;i+=2
                sy = dat.readInt16LE(i) * 1000 + ry * REGIONSIZE;i+=2
                w = dat.readUint16LE(i) * 1000;i+=2
                h = dat.readUint16LE(i) * 1000;i+=2
                if(x >= sx && x < sx + w && y >= sy && y < sy + h)break
                let len = dat.readUint32LE(i + 4)
                i += dat.readUint16LE(i) + dat.readUint16LE(i + 2) + 8
                while(len--){
                    let id = dat.readUint16LE(i)
                    let a = id & 2 ? 1 : 0
                    let b = id & 4 ? 1 : 0
                    let c = id & 8 ? 1 : 0
                    if(id & 1){
                        i += 10 + (b + c) * 4 + a * 2
                    }else{
                        i += b * 4 + a * 2 + 15
                        i += dat[i] + (id & 16 ? 2 : 1)
                        i += id & 32 ? dat[i] + 1 : 0
                    }
                }
            }
            sector.x = sx + w / 2
            sector.y = sy + h / 2
            sector.w = w
            sector.h = h
            sector.w2 = w / 2
            sector.h2 = h / 2
            sector.time = 0
            let len = dat.readUint32LE(i + 4)
						let sname = dat.readUint16LE(i)
						let ip = dat.readUint16LE(i + 2)
						i += 8
						sname = ""+dat.slice(i, i += sname)
            ip = ""+dat.slice(i, i += ip)
						sector.name = sname
            let arr = []
            while(len--){
                let id = dat.readUint16LE(i);i+=2
                let a = id & 2 ? 1 : 0
                let b = id & 4 ? 1 : 0
                let c = id & 8 ? 1 : 0
                let o
                if(id & 1){
                    let x = dat.readInt32LE(i);i += 4
                    let y = dat.readInt32LE(i);i += 4
                    let dx = 0
                    let dy = 0
                    if(a)i += 2
                    if(b)dx = dat.readFloatLE(i),i += 4
                    if(c)dy = dat.readFloatLE(i),i += 4
                    id >>= 4
                    sector.objects.push(new Asteroid(o={id,x,y,dx,dy}))
                }else{
                    let id2 = dat[i++]
                    let x = dat.readInt32LE(i);i += 4
                    let y = dat.readInt32LE(i);i += 4
                    let mass = dat.readInt32LE(i);i += 4
                    let spin = 0
                    if(a)i += 2
                    if(b)spin = dat.readFloatLE(i),i += 4
                    i += dat[i] + 1
                    let richness = 0.1
                    let resource = "name:100"
                    if(id & 16)richness = dat[i++] / 100
                    if(id & 32)resource = dat.slice(i + 1, i += dat[i] + 1).toString()
                    id >>= 8
                    id += id2 << 8
                    sector.planets.push(new Planet(o={radius:id,x,y,mass,spin,superhot:c,richness,resource}))
                }
                arr.push(o)
            }
            console.log("Done! Enter \x1b[33mPORT\x1b[m:")
            let _u = function(p){
                if(+p != +p || p > 65535 || p < 0)return console.log("Enter \x1b[33mPORT\x1b[m:"), RESPONSE = _u
                let name = (meta && meta.path.replace(/^\//,"")) || 'sectors/sector_'+Math.round(sx/1000)+'_'+Math.round(sx/1000)
                fs.writeFileSync(name, arr.map(a=>Object.entries(a).map(a=>a.join(': ')).join('\n')).join('\n\n'))
                if(xy)return process.exit(0)
                fs.writeFileSync('meta', 'x: '+sx+'\ny: '+sy+'\nw: '+w+'\nh: '+h+'\nport: '+p+'\npath: '+name+'\nname: '+sname)
                setInterval(tick.bind(undefined, sector), 1000 / FPS)
                server.bind(p)
            }
            let p = process.argv[2]
            if(xy && +p == +p && p <= 65535 && p >= 0)_u(p);
            else if(xy)throw new Error('Invalid port')
            else RESPONSE = _u
        }
        return '\x1b[1A'
    }
    RESPONSE = _w
    if(xy)setImmediate(a=>(RESPONSE(xy[0]),RESPONSE(xy[1]),RESPONSE=null))
}else{
    setImmediate(function(){
        sector.w = meta.w
        sector.h = meta.h
        sector.x = meta.x + meta.w / 2
        sector.y = meta.y + meta.h / 2
        sector.w2 = sector.w / 2
        sector.h2 = sector.h / 2
        sector.time = 0
				sector.name = meta.name
        let data = readfile(meta.path.replace(/^\//,""))
        data.forEach(function(item){
            if(item.id)sector.objects.push(new Asteroid(item))
            else sector.planets.push(new Planet(item))
        })
        setInterval(tick.bind(undefined, sector), 1000 / FPS)
        server.bind(meta.port || meta.ip.split(":")[1])
    })
}

// functions.js
//4

//Like Object.assign but already-existing properties aren't overwritten
//Usage: Object.fallback(a: {...}, ...b: ...{...}) -> {...}
//Example: Object.fallback({a:1, x: 99}, {a:1,b:2,c:3}, {c: 4}) == {a: 1, b: 2, c: 4, x: 99}
Object.fallback = function(a, ...b){for(let o of b)for(let i in o){
    if(o[i] && typeof o[i] == "object"){
      if(!(i in a))a[i] = Array.isArray(o[i]) ? [] : {}
      Object.fallback(a[i], o[i])
      continue
    }
    if(!(i in a))a[i]=o[i]
};return a}
function strbuf(str){
  //Buffer of 4 empty bytes + the string
  let b = Buffer.from("    "+str)
  //Write length onto first 4 bytes
  b.writeUint32LE(b.length-4)
  return b
}
function send(buffer, ip){
  ip = ip.split(/[: ]/g)
  server.send(buffer, +ip[1], ip[0])
}
const load = () => { //calculate server load
  let usage = performance.eventLoopUtilization()
  let ac = (lactive - (lactive = usage.active))
  return ac / (lidle - (lidle = usage.idle) + ac)
}
function sign(doc){ //RSA-sign document
  const signer = crypto.createSign('RSA-SHA256')
  signer.write(doc)
  signer.end()
  return signer.sign(PRIVATE_KEY, 'binary')
}

//Works well, don't touch
BufWriter.prototype.code = function(a){this.buf[0][0]=a+(this.critical?128:0);return this}
BufWriter.prototype.send = function snd(buf=this){let c=buf.critical?buf.ship:null;if(buf.toBuf)buf=buf.toBuf();c&&(c.crits[buf[1]]=buf,c.crits[(buf[1]-3)&255]=undefined);server.send(buf,this.remote.port,this.remote.address)}

// simulation.js
//5
function tick(sector){
  for(var o of sector.objects){
    if(o == EMPTY || !(o.x || o.y))continue;
    for(var p of sector.planets){
      o.updatep(p)
    }
    //if(o.u && performance.nodeTiming.duration - o.u._idleStart > 500)continue
    o.x += o.dx
    o.y += o.dy
    o.z += o.dz
  }
  sector.time++
  NOW = Math.floor(Date.now()/1000)
}

class Physics{
  update(thing){
    let d = this.x - thing.x
    let r = this.y - thing.y
    d = d * d + r * r
    r = (this.radius + thing.radius) * (this.radius + thing.radius)
    if(d >= r * 4)return
    let sum = this.mass + thing.mass
    let diff = this.mass - thing.mass
    let nvx = (this.dx * diff + (2 * thing.mass * thing.dx)) / sum
    let nvy = (this.dy * diff + (2 * thing.mass * thing.dy)) / sum
    thing.dx = ((2 * this.mass * this.dx) - thing.dx * diff) / sum
    thing.dy = ((2 * this.mass * this.dy) - thing.dy * diff) / sum
    this.dx = nvx
    this.dy = nvy
  }
  updatep(thing){
    let d = this.x - thing.x
    let r = this.y - thing.y
    d = d * d + r * r
    r = (this.radius + thing.radius) * (this.radius + thing.radius)
    let deathzone = thing.mass * thing.mass * G * G / d > this.speed * this.speed / 1000
    if((d < r && thing.superhot) || deathzone){
        if(this.respawnstate)return this.respawn()
    }
    if((Math.abs(this.x) > sector.w2 || Math.abs(this.y) > sector.h2) && this.respawnstate)return this.respawn()
    let M = thing.mass * G
    let m = Math.min(M / (16 * r) - M / d, 0)
    this.dx += (this.x - thing.x) * m
    this.dy += (this.y - thing.y) * m
    this.z += thing.dz * r / d
  }
}

// objects.js
//6
class Planet{
  constructor(dict){
    this.x = +dict.x
    this.y = +dict.y
    this.radius = dict.radius
    this.mass = dict.mass
    this.z = 0
    this.dz = dict.spin
    this.superhot = dict.superhot
    this.filename = "pdata/" + (sector.x + this.x) + "_" + (sector.y + this.y) + ".json"
    let dat = null
    if(dict.resource)try{dat = JSON.parse(fs.readFileSync(this.filename))}catch(e){dat = null}
    [this.name, this.price = 0, this.price2 = 0] = dict.resource ? dict.resource.split(":") : []
    this.price *= 1
    this.price2 *= 1
    this.data = dat
    if(this.data && this.data.health > 4095){
      this.data.health -= 4096
      this.heal()
    }
  }
  heal(){
    this.data.health += 4096
    let stop = setInterval(function(){
      this.data.health += 64
      if(this.data.health > 8190){
        stop()
        this.data.health = 4095
      }
    }, 30)
  }
  toBuf(buf, id, pid){
    if(!this.data)return
    let it = this.data.items
    buf.short(id)
    buf.int(this.data.last || (this.data.last = NOW - 60))
    buf.byte((this.data.health || 4095) >> 4)
    buf.float(this.data.inbank || 0)
    buf.float(this.data.inbank2 || 0)
    buf.byte((this.data.name || "").length + (this.data.health > 4095 ? 128 : 0))
    buf.buffer(Buffer.from(this.data.name || ""))
    let k = Object.keys(it)
    if(k.length == 0)return buf.byte((this.data.owner ? 160 : 32) + ((!this.data.owner && !this.superhot) || this.data.owner == pid ? 64 : 0))
    buf.byte((this.data.owner ? 128 : 0) + ((!this.data.owner && !this.superhot) || this.data.owner == pid ? 64 : 0))
    buf.byte(k.length - 1)
    for(var i of k){
      if(it[i].finish < NOW){
        this.collect()
        it[i].finish = undefined
        if(it[i].id < 128)it[i].lvl++
        if(it[i].id == 0)this.data.camplvl = it[i].lvl
      }
      buf.byte((it[i].finish ? 128 : 0) + it[i].id)
      buf.byte(it[i].lvl)
      buf.byte(it[i].cap)
      buf.byte(i)
      if(it[i].finish || it[i].id > 127){
        buf.int(it[i].finish || 0)
      }
    }
  }
  collect(){
    let earned = 0, cap = 0, earned2 = 0, cap2 = 0
    for(var i in this.data.items){
      let itm = this.data.items[i]
      if(itm.finish)continue
      switch(itm.id){
        case 1:
        earned += ITEMS[1][itm.lvl].persec || 0
        cap += ITEMS[1][itm.lvl].storage || 0
        break
        case 3:
        earned2 += ITEMS[3][itm.lvl].persec || 0
        cap2 += ITEMS[3][itm.lvl].storage || 0
        break
      }
    }
    this.data.last = this.data.last || Math.floor(NOW - 60)
    let diff = Math.floor(NOW - this.data.last)
    this.data.last += diff
    unsaveds[this.filename] = this.data
    this.data.inbank = Math.min(cap, (this.data.inbank || 0) + Math.round(diff * earned))
    this.data.inbank2 = Math.min(cap2, (this.data.inbank2 || 0) + Math.round(earned2 * diff))
  }
}

class Asteroid extends Physics{
  constructor(dict){
    super()
    this.x = +dict.x
    this.y = +dict.y
    this.dx = +dict.dx || 0
    this.dy = +dict.dy || 0
    this.z = 0
    this.id = +dict.id
    this.dz = asteroids[this.id].spin
    this.radius = asteroids[this.id].radius
    this.mass = asteroids[this.id].mass
    this.respawnstate = [this.x, this.y, this.dx, this.dy]
    this.health = this.mass / 10
  }
  toBuf(buf){
    buf.float(this.x)
    buf.float(this.y)
    buf.byte(Math.max(Math.min(127, Math.round(this.dx / 4)), -128))
    buf.byte(Math.max(Math.min(127, Math.round(this.dy / 4)), -128))
    buf.byte(Math.round(this.z / PI256))
    buf.byte(Math.round(this.dz * 768))
    buf.short(6 + (this.id << 5))
    buf.short(this.health * 10 >= this.mass)
    return buf
  }
  respawn(){
    this.health = this.mass / 10
    this.x = this.respawnstate[0]
    this.y = this.respawnstate[1]
    this.dx = this.respawnstate[2]
    this.dy = this.respawnstate[3]
  }
}

// clientdata.js
//7
class ClientData extends Physics{
  constructor(name = "", id = "", remote = ""){
    super()
    this.name = name
    this.playerid = id
    this.remote = remote+""
    this.state = 0
    this.x = 0.0
    this.y = 0.0
    this.dx = 0.0
    this.dy = 0.0
    this.z = 0.0
    this.dz = 0.0
    this.thrust = 0
    this.id = 0
    this.u = null
    this.shoots = null
    this.seq = 0
    this.seq2 = 0
    this.last = 0
    this.data = {}
    this.crits = []
    clientKeys[this.i = clientI++] = this
  }
  xp(a){
    this.data.xp += Math.floor(a)
    while(this.data.xp >= this.data.lvl * 100){
      this.data.xp -= this.data.lvl * 100
      this.data.lvl++
    }
  }
  give(amount=0, amount2=0){
    this.data.bal = (this.data.bal||0) + amount
    this.data.bal2 = (this.data.bal2||0) + amount2
    this.xp(amount / 50 + amount2 / 10)
  }
  take(amount=0,amount2=0){
    if(!(this.data.bal >= amount && this.data.bal2 >= amount2))return false
    this.data.bal -= amount
    this.data.bal2 -= amount2
    this.xp(amount / 50 + amount2 / 10)
    return true
  }
  ready(x, y, id, w){
    this.ix = sector.objects.indexOf(EMPTY)
    if(this.ix == -1)this.ix = sector.objects.length
    sector.objects[this.ix] = this
    this.x = +x
    this.y = +y
    this.id = id >>> 0
    let dat = ships[this.id]
    this.radius = dat.radius
    this.mass = dat.mass
    this.speed = dat.speed
    this.spin = dat.spin
    this.state = id != 3 ? 1 : 3
    this.ping()
    this.range = w * w
  }
  validate(buffer){
    //let delay = -0.001 * FPS * (this.u - (this.u=NOW))
    let x = buffer.float()
    let y = buffer.float()
    let dx = buffer.byte() * 4
    let dy = buffer.byte() * 4
    let z = buffer.byte() * PI256
    let dz = buffer.byte() / 768
    let thrust = buffer.ushort()
    this.cosmetic = buffer.ushort()
    /*if(true){
      this.ship = (ship << 8) + level
    }
    let mult = 1
    let amult = 1
    if(thrust & 1){
      this.dx += -sin(z) * mult / 30
      this.dy += cos(z) * mult / 30
    }
    if(dx < this.dx)this.dx = dx, update = true
    if(dy < this.dy)this.dy = dy, update = true
    this.thrust = thrust & 7
    if(thrust & 4) dz -= 0.002
    if(thrust & 2) dz += 0.002
    this.x += dx
    this.y += dy
    this.z += dz
    
    let buf = Buffer.alloc(16)
    let update = 6
    if(Math.abs(this.dx - dx) < mult / 60)this.dx = dx, update--
    if(Math.abs(this.dy - dy) < mult / 60)this.dy = dy, update--
    if(Math.abs(this.x - x) < dx * 0.5)this.x = x, update--
    if(Math.abs(this.y - y) < dy * 0.5)this.y = y, update--
    if(Math.abs(this.dz - dz) < amult * 0.001)this.dz = dz, update--
    if(Math.abs(this.z - z) < dz * 0.5)this.z = z, update--
    if(!update)return this.toBuf()*/
    if(this.x || this.y){
      let d = Math.max(Math.abs(this.x - x), Math.abs(this.y - y))
      this.mission("travel", d/1000)
      this.data.stats.travel += d
    }
    this.x = x
    this.y = y
    this.z = z
    this.dx = dx
    this.dy = dy
    this.dz = dz
    this.thrust = thrust & 31
    this.id = thrust >> 5
  }
  toBuf(buf, ref){
    if(performance.nodeTiming.duration - this.u._idleStart > 1000){buf.int(0);buf.int(0);buf.int(0);buf.int(0);return}
    buf.float(this.x)
    buf.float(this.y)
    buf.byte(Math.max(Math.min(127, Math.round(this.dx / 4)), -128))
    buf.byte(Math.max(Math.min(127, Math.round(this.dy / 4)), -128))
    buf.byte(Math.round(this.z / PI256))
    buf.byte(Math.round(this.dz * 768))
    buf.short((this.thrust & 31) + (this.id << 5) + (!(this.thrust & 16) && this.shoots == ref ? 16 : 0))
    buf.short(this.cosmetic)
    if(this.shoots == ref)this.shoots = null
    return buf
  }
  ping(){
    clearTimeout(this.u)
    this.u = setTimeout(this.destroy.bind(this),5000)
  }
  destroy(){
    server.send(Buffer.concat([Buffer.of(127), strbuf('Disconnected for inactivity')]), this.remote.split(':')[1], this.remote.split(':')[0])
    this.wasDestroyed()
  }
  wasDestroyed(){
    clearTimeout(this.u)
    clients.delete(this.remote)
		broadcast({title: `User "${this.name}" left`, color: 0xEE5522, fields: [{name: "sector", value: sector.name || `(${Math.round(sector.x/1000)}, ${Math.round(sector.y/1000)})`}, {name: "online", value: clients.size+""}]})
    sector.objects[sector.objects.indexOf(this)]=EMPTY
    while(sector.objects[sector.objects.length-1]==EMPTY)sector.objects.pop()
    delete clientKeys[this.i]
    fs.writeFileSync("users/"+this.playerid, JSON.stringify(this.data))
  }
  save(){
    let buf = Buffer.from(JSON.stringify(this.data))
    let sig = sign(buf)
    buf = Buffer.concat([Buffer.of(sig.length, sig.length >> 8), sig, buf])
    sig = Number((BigInt("0x" + this.playerid) % SERVERCOUNT))
  }
  mission(key, value){
    if(!this.data.missions)this.data.missions = {travel: 10, planets: 1, destroy: 5}
    if(!this.data.missions[key])return
    if(value >= this.data.missions[key]){
      this.data.missionlvls[key] |= 0
      let {xp, gems} = missionStats[key][this.data.missionlvls[key]]
      if(this.data.missionlvls[key] < missionStats[key].length)this.data.missionlvls[key]++
      this.xp(xp)
      this.data.gems += gems
      delete this.data.missions[key]
      
      let name = missions[Math.floor(Math.random() * missions.length)]
      while(this.data.missions[name])name = missions[Math.floor(Math.random() * missions.length)]
      this.data.missions[name] = missionStats[name][this.data.missionlvls[name]||0].amount
    }else{
      this.data.missions[key] -= value
    }
  }
}

// udpserver.js
//8
server.on('listening', function() {
    console.log('\x1b[32mUDP Server listening on port '+(server.address().port)+'\x1b[m');
})

server.on('message', async function(m, remote) {
    let message = new Buf(m.buffer)
    let send = data => server.send(data,remote.port,remote.address)
    let address = remote.address + ':' + remote.port
    let code = message.ubyte()
    //Get ship from map
    let ship = clients.get(address)
    message.critical = 0
    if(code > 127){
        code -= 128
        message.critical = message.ubyte() + 256 //when its encoded again it will be put in the 0-255 range again
        //With this you can now reliably check if its critical without having to use a comparing operator
    }
    //If it's a critical and we already recieved it
    if(message.critical && ship && ship.crits && ship.crits[message.critical-256])return send(ship.crits[message.critical-256])
    if(code === CODE.HELLO && message.critical){if(ship === 0)return
        //Auth packet
        try{
            let version = message.ushort()
            if(version < VERSION)return send(Buffer.concat([Buffer.of(127), strbuf('Please Update')]))
            //sig, salt, url, id, ...
            let len = message.ubyte()
            let publicKeyUrl = message.str(len)
            len = message.ushort()
            let signature = Buffer.from(message.buffer(len)).toString("base64")
            len = message.ubyte()
            let salt = Buffer.from(message.buffer(len)).toString("base64")
            len = message.ubyte()
            let playerId = message.str(len)
            let timestamp = message.uint() + message.uint() * 4294967296
            len = message.ubyte()
            let name = message.str(len)
            //w = width of their screen
            let w = Math.min(4000, message.ushort())
            clients.set(address, 0)
            let err = await new Promise(r => verify({publicKeyUrl, signature, salt, playerId, timestamp, bundleId}, r))
            if(err){
                //if(notGuest)
                if(timestamp > 1)return send(Buffer.from(Buffer.concat([Buffer.of(127), strbuf("Invalid identity")])))
                //is guest, uppercase
                playerId = "1" + playerId.toLowerCase()
            }else playerId = playerId.slice(3).toLowerCase() //not guest, lowercase
            //fetch DB stuff
            let cli = new ClientData(name, playerId, address)
            fetchdata(playerId).then(a => {
                Object.fallback(a, PLAYERDATA)
                cli.ready(0, 0, 0, w)
                cli.data = a
                clients.set(address, cli)
                let buf = Buffer.alloc(22 + Math.ceil(sector.planets.length / 8))
                buf[0] = 129
                buf[1] = message.critical
                buf.writeDoubleLE(cli.data.bal || 0, 2)
                buf.writeFloatLE(cli.data.bal2 || 0, 10)
                buf.writeFloatLE(cli.data.gems || 0, 14)
                buf.writeFloatLE(cli.data.adcd - NOW, 18)
                let b = 1, i = 22
                for(let p of sector.planets){
                    b <<= 1
                    if(p.data && p.data.owner == cli.playerid)b ^= 1
                    if(b > 255){
                        buf[i++] = b
                        b = 1
                    }
                }
                while(b < 255)b <<= 1
                buf[i++] = b
                send(buf)
                cli.crits[message.critical-256] = buf
								broadcast({title: `User "${name}" joined`, color: 0x2255EE, fields: [{name: "sector", value: sector.name || `(${Math.round(sector.x/1000)}, ${Math.round(sector.y/1000)})`}, {name: "online", value: clients.size+""}]})
            })
        }catch(e){
            console.log(e)
            send(Buffer.from(Buffer.concat([Buffer.of(127), strbuf('Connection failed')])))
        }
        return
    }
    if(typeof ship != "object")return
    let res = new BufWriter()
    res.remote = remote
    res.ship = ship
    res.critical = message.critical
    res.byte(0)
    message.critical && res.byte(message.critical)
    Object.fallback(ship.data, PLAYERDATA)
    try{ship.ping();msgs[code]&&msgs[code].call(ship,message,res)}catch(e){
			let msg = "\x1b[31m"+e.name+": "+e.message
			let m = ""
			e.stack.replace(/<anonymous>:(\d+):(\d+)/g,(_,line,pos)=>{
				msg += m
				line -= 2
				m = process.linesOfCode[line-1]
				m = "\x1b[;37m"+m.slice(0,pos-1).trim() + "\x1b[33;4m" + m.slice(pos-1).match(/(\w*)(.*)/).slice(1).join("\x1b[m\x1b[37m")
				let name = "", l = 0
				for(let i of process.fileIndex){
					if(i[1] > line)break
					name = i[0]
                    l = i[1]
				}
				m = "\n\x1b[34;4m" + name + ":" + (line-l) + ":" + pos + "\n" + m
			});
			console.log(msg)
			send(Buffer.concat([Buffer.of(127), strbuf("Bad Packet")]))}
});


//Codes
const CODE = {
    HELLO: 0,
    PING: 3,
    DISCONNECT: 127,
    PLANETBUY: 10,
    DATA: 5,
    CHANGEITEM: 14,
    COLLECT: 17,
    MAKEITEM: 20,
    SKIPBUILD: 23,
    REPAIR: 26,
    RESTORE: 29,
    ADWATCHED: 125
}
const RESP = {
    PONG: 4,
    PLANETBUY: 11,
    DATA: 6,
    DATA2: 7,
    PLANETDATA: 12,
    CHANGEITEM: 15,
    COLLECT: 18,
    MAKEITEM: 22,
    SKIPBUILD: 24,
    REPAIR: 27,
    RESTORE: 30,
    ADWATCHED: 126
}
const ERR = {
    PLANETBUY: 13,
    MAKEITEM: 21,
    COLLECT: 19,
    CHANGEITEM: 16,
    SKIPBUILD: 25,
    REPAIR: 28,
    RESTORE: 31,
}


// commands.js
//9
let FUNCS = {
    tp(player, x, y){
        if(player=="*"){let a = [];for(let i in clientKeys)a.push(FUNCS.tp(i,x,y));return a.join("\n")}
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        player.rubber = 1
        let i
        if(i = (x.match(/.[\~\^]/)||{index:-1}).index+1)[x, y] = [x.slice(0,i), x.slice(i)]
        if(x[0] == "~")x = player.x + +x.slice(1)
        if(y[0] == "~")y = player.y + +y.slice(1)
        if(x[0] == "^" && y[0] == "^"){
            x = (+x.slice(1))/180*Math.PI - player.z
            y = +y.slice(1);
            [x, y] = [player.x + Math.sin(x) * y, player.y + Math.cos(x) * y]
        }
        player.x = +x
        player.y = +y
        return "\x1b[90m[Teleported "+player.name+" to x: "+Math.round(player.x)+" y: "+Math.round(player.y)+"]"
    },
    list(){
        let players = []
        for(var i in clientKeys){
            let cli = clientKeys[i]
            players.push(i + ": "+cli.remote+": "+cli.name+" (x: "+cli.x+", y: "+cli.y+")")
        }
        return players.join("\n")
    },
    kick(player, reason="Kicked"){
        if(player=="*"){let a = [];for(let i in clientKeys)a.push(FUNCS.kick(i,reason));return a.join("\n")}
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        send(Buffer.concat([Buffer.of(127), strbuf(reason)]), player.remote)
        player.wasDestroyed()
        return "\x1b[90m[Kicked "+player.name+" with reason '"+reason+"']"
    },
    ban(player, reason="You have been banned"){
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        player.data.ban = reason
        send(Buffer.concat([Buffer.of(127), strbuf(reason)]), player.remote)
        player.wasDestroyed()
        return "\x1b[90m[Kicked "+player.name+" with reason '"+reason+"']"
    },
    debug(player){
        console.log(clientKeys[player] || "\x1b[31mNo such player")
    },
    freeze(player, time = Infinity){
        time-=0
        if(player=="*"){let a = [];for(let i in clientKeys)a.push(FUNCS.freeze(i,time));return a.join("\n")}
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        player.rubber = time * 10
        return time ? "\x1b[90m[Froze " + player.name + " for"+(time==Infinity?"ever":" "+time+"s")+"]" : "\x1b[90m[Unfroze "+player.name+"]"
    },
    crash(player){
        if(player=="*"){let a = [];for(let i in clientKeys)a.push(FUNCS.crash(i));return a.join("\n")}
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        player.x = NaN //Arithmetic crash
        send(Buffer.of(1), player.remote) //Early EOF crash
        player.rubber = Infinity //Force even if the client has packet loss issues
        return "\x1b[90m[Crashed " + player.name + "'s client]"
    },
    give(player, amount=0, a2=0){
        amount = +amount||0
        a2 = +a2||0
        if(player=="*"){let a = [];for(let i in clientKeys)a.push(FUNCS.give(i,amount,a2));return a.join("\n")}
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        player.give(amount, a2)
        player.rubber = 1
        return "\x1b[90m[Gave " + (amount ? "K$"+amount + (a2 ? " and R$"+a2 : "") : (a2 ? "R$" + a2 : "nothing")) + " to "+player.name+"]"
    },
    gem(player, amount=0){
        amount = +amount||0
        if(player=="*"){let a = [];for(let i in clientKeys)a.push(FUNCS.gem(i,amount));return a.join("\n")}
        player = clientKeys[player]
        if(!player)return "\x1b[31mNo such player"
        player.data.gems += amount
        player.rubber = 1
        return "\x1b[90m[Gave "+amount+" gems to "+player.name+"]"
    },
    clear(){setImmediate(console.clear);return ""}
}

// packet.js
//10
//res = response
//data = data input

const STATSOBJ = {travel: TYPES.FLOAT, planets: TYPES.USHORT}
function processData(data, res){
    let rubber = this.rubber > 0 ? (data.int(),data.int(),data.int(),data.int(),this.rubber--) : this.validate(data)
    let bitfield = data.ubyte()
    let hitc = bitfield & 7
    while(hitc--){
        let x = data.uint()
        this.dx = data.float()
        this.dy = data.float()
        let obj = sector.objects[x - (x <= this.ix)]
        if(!obj)continue
        if(obj instanceof ClientData && x <= sector.objects.indexOf(this))continue
        this.update(obj)
    }
    if(bitfield & 8){
        let x = data.uint()
        let obj = sector.objects[x - (x <= this.ix)]
        if(obj){
            this.shoots = obj
            if(obj instanceof Asteroid)if((obj.health -= damages[this.id]) <= 0){
                this.mission("destroy", 1)
                obj.respawn()
            }
        }
    }
    hitc = (bitfield >> 4) & 7
    if(hitc){
        let buf = new BufWriter()
        buf.byte(8)
        while(hitc--){
            let x = data.uint()
            let obj = sector.objects[x - (x <= this.ix)]
            let name = (obj && obj.name) || ""
            buf.int(x)
            buf.buffer(strbuf(name))
        }
        res.send(buf.toBuf())
    }
    
    if(bitfield & 128){
        //planet shot
        let p = sector.planets[data.ushort()]
        if(p && !(this.seq & 3) && p.data && p.data.owner && !(p.data.health > 4095)){
            p.data.health = (p.data.health || 4095) - 25
            if(p.data.health < 1){
                //destroyed
                p.data.health = 2048
                //TODO: remove 1 from planet stats of old owner
                p.data.owner = this.playerid
                p.data.name = this.name
                this.mission("steal", 1)
                p.collect()
                p.inbank = Math.floor((p.inbank || 0) / 2)
                p.inbank2 = Math.floor((p.inbank2 || 0) / 2)
                for(let i in p.data.items){
                    if(p.data.items[i].finish){
                        p.data.items[i].lvl++
                        p.data.items[i].finish = undefined
                    }
                    if(p.data.items[i].id < 128)p.data.items[i].id += 128
                }
            }
        }
    }
    
    let energy = data.int()
		this.mission("energy", energy)
    this.xp(energy / 10)
    this.give(energy)
    res.code(rubber ? RESP.DATA2 : RESP.DATA)
    res.byte(this.seq)
    if(rubber){
        res.double(this.data.bal)
        res.float(this.data.bal2)
        this.toBuf(res, this)
    }
    for(let obj of sector.objects){
        if(obj == this)continue
        obj.toBuf(res, this)
    }
    res.short(this.data.lvl)
    res.short(this.data.xp)
    res.send()
    if(!(this.seq % 10)){
        let buf = new BufWriter()
        if(data.critical)buf.byte(140),buf.byte(data.critical)
        else buf.byte(RESP.PLANETDATA)
        for(let i in sector.planets){
            let x = sector.planets[i].x - this.x
            let y = sector.planets[i].y - this.y
            if(x * x + y * y > this.range)continue
            sector.planets[i].toBuf(buf, i, this.playerid)
        }
        res.send(buf.toBuf())
        buf = new BufWriter()
        buf.byte(2)
        buf.obj(STATSOBJ, this.data.stats)
        buf.float(this.data.gems)
        for(let i in this.data.missions){
            buf.str(i)
            buf.byte(this.data.missionlvls[i])
            buf.float(this.data.missions[i])
        }
        buf.byte(0)
        res.send(buf.toBuf())
        
    }
}
let msgs = {
    [CODE.ADWATCHED](data, res){
        if(this.data.adcd > NOW){
            return res.code(RESP.ADWATCHED).send()
        }
        this.data.adcd = Math.max(NOW - 86400, this.data.adcd) + 21600
        this.data.gems += 5
        res.code(RESP.ADWATCHED)
        res.float(this.data.gems)
        res.float(this.data.adcd - NOW)
        res.send()
    },
    [CODE.PING](data, res){
        res.code(RESP.PONG).send()
    },
    [CODE.DISCONNECT](data, res){
        this.wasDestroyed()
    },
    [CODE.PLANETBUY](data, res){
        const planet = sector.planets[data.int()]
        if(!planet || !planet.name || (planet.data && planet.data.owner) || planet.superhot)return res.code(ERR.PLANETBUY).send()
        if(!this.take(planet.price, planet.price2))return res.code(ERR.PLANETBUY).send()
        planet.data = {owner: this.playerid, name: this.name, items: {0: {id: 0, lvl: 1, cap: 0}}, health: 4095, camplvl: 1}
        unsaveds[planet.filename] = planet.data
        this.mission("planets", 1)
        res.double(this.data.bal)
        res.float(this.data.bal2)
        res.code(RESP.PLANETBUY).send()
        this.data.stats.planets++
    },
    [CODE.MOVESECTOR](data, res){
        let x = data.float()
        let y = data.float()
        //magic
        
        let newSector = 1
        this.wasDestroyed()
    },
    [CODE.DATA](data, res){
        if(this.id == 0)this.id = 1
        this.seq++
        let seq2 = data.byte() + (this.seq2 & -256)
        if(seq2 < this.seq2)seq2 += 256
        let diff = seq2 - this.seq2
        if(diff > 127)return
        this.seq2 = seq2
        this.last = Math.min(NOW*1000 + 300, Math.max(NOW, this.last + diff * 100))
        diff = this.last - NOW*1000
        if(diff <= 0)processData.call(this, data, res)
        else setTimeout(processData.bind(this, data, res), diff - 2)
    },
    [CODE.CHANGEITEM](data, res){
        let x = data.ushort()
        let planet = sector.planets[x]
        if(!planet || !planet.data || planet.data.owner != this.playerid)return res.code(ERR.CHANGEITEM).send()
        x = data.ubyte()
        if(!planet.data.items || !planet.data.items[x])return res.code(ERR.CHANGEITEM).send()
        if(data.length > data.i){
            //rotate
            let y = data.ubyte()
            if(planet.data.items[y])return res.code(ERR.CHANGEITEM).send()
            planet.data.items[y] = planet.data.items[x]
            delete planet.data.items[x]
            if(planet.data.items[y].id == 0)planet.data.camp = y
        }else{
            //lvlup
            let item = planet.data.items[x]
            if(!item)return res.code(ERR.CHANGEITEM).send()
            let dat = ITEMS[item.id][item.lvl+1]
            if(!dat)return res.code(ERR.CHANGEITEM).send()
            if(item.lvl >= (planet.data.camplvl - ITEMS[item.id][0].available) + 1)return res.code(ERR.CHANGEITEM).send()
            if(!this.take(dat.price, dat.price2))return res.code(ERR.CHANGEITEM).send()
            if(item.id===1)this.mission("drill", 1)
            if(item.id===2)this.mission("canon",1)
            planet.collect()
            item.finish = (NOW + dat.time) >>> 0
            unsaveds[planet.filename] = planet.data
        }
        res.double(this.data.bal)
        res.float(this.data.bal2)
        res.code(RESP.CHANGEITEM).send()
    },
    [CODE.COLLECT](data, res){
        let planet = sector.planets[data.ushort()]
        if(!planet || !planet.data || planet.data.owner != this.playerid || !planet.data.items)return res.code(ERR.COLLECT).send()
        planet.data.name = this.name
        res.code(RESP.COLLECT)
        planet.collect()
        this.mission("energy", planet.data.inbank) //resourse balance
        this.mission("research", planet.data.inbank2) //research balance
        this.data.bal += planet.data.inbank
        this.data.bal2 += planet.data.inbank2
        res.double(this.data.bal)
        res.float(this.data.bal2)
        planet.data.inbank = 0
        planet.data.inbank2 = 0
        res.send()
    },
    //Add an item to planet
    [CODE.MAKEITEM](data, res){
        let planet = sector.planets[data.ushort()]
        if(!planet || planet.data.owner != this.playerid)return res.code(ERR.MAKEITEM).send()
        let x = data.ubyte()
        let i = data.ubyte()
        if(!i || (planet.data.items = planet.data.items || {})[x])return res.code(ERR.MAKEITEM).send()
        let num = 0
        for(itm in planet.data.items)if(planet.data.items[itm].id == i)num++
        if(num >= (planet.data.camplvl - ITEMS[i][0].available)/ITEMS[i][0].every + 1)return res.code(ERR.MAKEITEM).send()
        let dat = ITEMS[i][1]
        if(!this.take(dat.price, dat.price2))return res.code(ERR.MAKEITEM).send()
				this.mission("build", 1)
        planet.data.items[x] = {id: i, lvl: 0, cap: 0, finish: (NOW + dat.time) >>> 0}
        unsaveds[planet.filename] = planet.data
        res.double(this.data.bal)
        res.float(this.data.bal2)
        res.code(RESP.MAKEITEM).send()
    },
    [CODE.SKIPBUILD](data, res){
        let x = data.ushort()
        let planet = sector.planets[x]
        if(!planet || !planet.data || planet.data.owner != this.playerid)return res.code(ERR.SKIPBUILD).send()
        x = data.ubyte()
        if(!planet.data.items || !planet.data.items[x] || !planet.data.items[x].finish)return res.code(ERR.SKIPBUILD).send()
        let item = planet.data.items[x]
        let price = Math.ceil((item.finish - NOW) / 300)
        if(this.data.gems < price || price < 1)return res.code(ERR.SKIPBUILD).send()
        this.data.gems -= price
        planet.collect()
        item.finish = 1 //skip
        unsaveds[planet.filename] = planet.data
        res.float(this.data.gems)
        res.code(RESP.SKIPBUILD).send()
    },
    [CODE.REPAIR](data, res){
        let x = data.ushort()
        let planet = sector.planets[x]
        if(!planet || !planet.data || planet.data.owner != this.playerid)return res.code(ERR.REPAIR).send()
        x = data.ubyte()
        if(!planet.data.items || !planet.data.items[x] || planet.data.items[x].id < 128)return res.code(ERR.REPAIR).send()
        let item = planet.data.items[x]
        let {price, price2, time} = ITEMS[item.id-128][item.lvl]
        if(!this.take((price||0) * 1.5, (price2||0) * 1.5))return res.code(ERR.REPAIR).send()
        item.id -= 128
        item.lvl--
        item.finish = Math.floor(NOW + (time || 0) * 0.5)
        unsaveds[planet.filename] = planet.data
        res.double(this.data.bal)
        res.float(this.data.bal2)
        res.code(RESP.REPAIR).send()
    },
    [CODE.RESTORE](data, res){
        let x = data.ushort()
        let planet = sector.planets[x]
        if(!planet || !planet.data || planet.data.owner != this.playerid)return res.code(ERR.RESTORE).send()
        if(planet.data.health > 4095)return
        if(!this.take(Math.floor(10000 - (planet.data.health>>4)*39.0625)))return res.code(ERR.RESTORE).send()
        planet.heal()
        unsaveds[planet.filename] = planet.data
        res.double(this.data.bal)
        res.code(RESP.RESTORE).send()
    }
}

// discord.js
//11
const URL = "https://discord.com/api/webhooks/941632057208082462/bQMgSP4B0rNTDFbZG5IbjWZ3Y9J2pfdGr-scMZlBvlFDelBia9u8sqZt58o2vK-hSShJ"


const {WebhookClient} = require("discord.js")

const client = new WebhookClient({url: URL})

const broadcast = (...embeds) => {
	client.send({embeds})
}