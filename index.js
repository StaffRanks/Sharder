const EventEmitter = require("events");
const numCPUs = require('os').cpus().length;
const Eris = require("eris");
const utils = require("./utils")
const axios = require("axios")

class ClusterManager extends EventEmitter {

    constructor(token, option) {
        super();

      let options = option || {}

      this.token = token  || null
      this.clientOptions = options.clientOptions || {}
      this.clusters = []

        this.shardCount = options.shards || 'auto';
        this.firstShardID = options.firstShardID || 0;
        this.lastShardID = options.lastShardID || 0;
        this.clusterCount = options.clusters || numCPUs;
        this.guildsPerShard = options.guildsPerShard || 1300;
        this.webhook = typeof options.webhook === "string" ? { url: options.webhook , auth: undefined } : options.webhook
        this.fetchErrorEvent = options.fetchErrorEvent || true

       if (this.token) {
            this.bot = new Eris(token);
        } else {
            throw new Error("No token provided");
        }
        
       this.startSharder();
       this._eventstowebhook();
    }

// array
get guilds() { return utils.getFromCollection(this.clusters , "guilds") }
get groupChannels() { return utils.getFromCollection(this.clusters , "groupChannels") }
get privateChannels() { return utils.getFromCollection(this.clusters , "privateChannels") }
get relationships() { return utils.getFromCollection(this.clusters , "relationships") }
get shards() { return utils.getFromCollection(this.clusters , "shards") }
get unavailableGuilds() { return utils.getFromCollection(this.clusters , "unavailableGuilds") }
get voiceConnections() { return utils.getFromCollection(this.clusters , "voiceConnections") }
get users() { return utils.getFromCollection(this.clusters , "users") }

// object
get application() { return utils.getFromObject(this.clusters , "application") }
get channelGuildMap() { return utils.getFromObject(this.clusters , "channelGuildMap") }
get guildShardMap() { return utils.getFromObject(this.clusters , "guildShardMap") }
get notes() { return utils.getFromObject(this.clusters , "notes") }
get options() { return utils.getFromObject(this.clusters , "options") }
get privateChannelMap() { return utils.getFromObject(this.clusters , "privateChannelMap") }
get userGuildSettings() { return utils.getFromObject(this.clusters , "userGuildSettings") }
get userSettings() { return utils.getFromObject(this.clusters , "userSettings") }

// events

_eventstowebhook() {
let checkWebhook = () => this.webhook && typeof this.webhook === "object" && this.webhook.url
let send = (type , data) =>{
return checkWebhook() ? this.fetch("POST" , this.webhook.url , this.webhook.auth || false , {"type":type,"data":data, content: data ? data.content : undefined}) : undefined
}
this.on("start" , () => send("start" , {content: "Started!"}))
this.on("clusterCreate" , (bot) => send("clusterCreate" , {bot:bot , content: `Cluster ${this.clusters.indexOf(bot)} | Ready!`}))

this.on("connect" , (id) => send("connect" , {content: `Shard ${id} established connection!`,id:id}))
this.on("shardDisconnect" , (id , err) => send("shardDisconnect" , {content: `Shard ${id} disconnected!`, id:id , message:err}))
this.on("shardReady" , (id) => send("shardReady" , {content: `Shard ${id} is ready!`,id:id}))
this.on("shardResume" , (id) => send("shardResume" , {content: `Shard ${id} has resumed!`,id:id}))
this.on("warn" , (message, id) => send("warn" , {content: `Shard ${id} | ${message.stack}`,id:id , message:message}))
this.on("error" , (message, id) => send("error" , {content:`Shard ${id} | ${message.stack}`,id:id , message:message}))
this.on("ready" , (bot , id , last) => send("ready" , {content: `Shards ${id} - ${last} are ready!`,bot:bot,firstShardID:id , lastShardID:last}))
}

async startSharder() {
let shards = await this.calculateShards()
this.shardCount = shards;
if (this.lastShardID === 0) this.lastShardID = this.shardCount - 1;
this.emit("start")
this.startCluster()
}


async calculateShards() {
        let shards = this.shardCount;

        let result = await this.bot.getBotGateway();
        shards = this.shardCount || result.shards;

        if (shards === 1) {
            return Promise.resolve(shards);
        } else {
            let guildCount = shards * 1000;
            let guildsPerShard = this.guildsPerShard;
            let shardsDecimal = guildCount / guildsPerShard;
            let finalShards = Math.ceil(shardsDecimal);
            return Promise.resolve(finalShards);
        }
    }


async startCluster(all = true) {
let shards = [];

for (let i = this.firstShardID; i <= this.lastShardID; i++) {
   shards.push(i);
}
            let chunkedShards = this.chunk(shards, this.clusterCount);
chunkedShards.forEach((chunk, clusterID) => {

let bot = new Eris(this.token , Object.assign(this.clientOptions , {
maxShards: this.shardsCount,
firstShardID: Math.min(...chunk),
lastShardID: Math.max(...chunk)
}))

bot.sharder = this
bot.connect();

let checkWebhook = () => this.webhook && typeof this.webhook === "object" && this.webhook.url
let send = (type , data) =>{
return checkWebhook() ? this.fetch("POST" , this.webhook.url , this.webhook.auth || false , {"type":type,"data":data}) : undefined
}

        bot.on("connect", id => this.emit("shardConnect" , id));
        bot.on("shardDisconnect", (err, id) => this.emit("shardDisconnect" , id , err));
        bot.on("shardReady", id => this.emit("shardReady" , id));
        bot.on("shardResume", id => this.emit("shardResume" , id));
        bot.on("warn", (message, id) => this.emit("warn" , id , message));
        bot.on("error", (error, id) => this.emit("error" , id , error));
        bot.once("ready", () => this.emit("ready" , bot , bot.options.firstShardID , bot.options.lastShardID ));

this.clusters.push(bot)
this.emit("clusterCreate" , bot)

})
}

chunk(shards, clusterCount) {
        if (clusterCount < 2) return [shards];

        let len = shards.length;
        let out = [];
        let i = 0;
        let size;

        if (len % clusterCount === 0) {
            size = Math.floor(len / clusterCount);

            while (i < len) {
                out.push(shards.slice(i, i += size));
            }
        } else {
            while (i < len) {
                size = Math.ceil((len - i) / clusterCount--);
                out.push(shards.slice(i, i += size));
            }
        }

        return out;
}


fetch(method, url, auth , body , headers , responseType){
let authHeaders = { 'authorization': auth || auth === false ? "" : this.token }
return new Promise((re , rej) =>{

let error = false;
axios({
method: method || "GET",
url:url,
headers: headers ? Object.assign(authHeaders , headers) : authHeaders,
data: body,
responseType: responseType
}).catch(err =>{
if(!this.fetchErrorEvent) return this.emit("fetchError" , err)
rej(err)
error = true
}).then(res =>{
if(!error) return;
re(res)
})

})
}


}

module.exports = ClusterManager
