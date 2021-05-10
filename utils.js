module.exports = {

getFromCollection: (clusters , id) =>{
let arr = []
clusters.map(c => c[id]).forEach(guildsOfBots =>{
guildsOfBots.filter(s => s).forEach(g => arr.push(g))
})
return arr
},


getFromObject: (clusters , id) =>{
let obj = {}

clusters.map(c => c[id]).forEach(object =>{
let obj2 = Object.assign(obj , object)
obj = obj2
})

return obj
}

}