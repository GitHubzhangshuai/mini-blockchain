const crypto = require('crypto')
const dgram = require('dgram')
const fs = require('fs')
const rsa = require('./rsa')

// 创世区块
const initBlock = {
    index: 0,
    data: 'hello world',
    prevHash: '0',
    timestamp: new Date('2020/04/04').getTime(),
    nonce: 123456,
    hash: '00000babe0c632264a8fd92b9f188934273cb9f25f76876fbddec90aab2651e3'
}

class Blockchain{
    constructor(){
        this.blockchain = [
            initBlock
        ]
        // 远程地址存文件
        this.remoteFile = `${__dirname}/address.json`
        this.data = []
        this.difficulty = 4
        // 所有的网络节点信息 address port
        this.peers = []
        this.remote = {}
        // 种子节点
        this.seed = {port:8001,address:'127.0.0.1'}
        this.udp = dgram.createSocket('udp4')
        this.init()
    }

    init(){
        this.bindP2p()
        this.bindExit()
    }

    bindP2p(){
        this.udp.on('message',(data,remote)=>{
            const {address,port} = remote
            const action = JSON.parse(data)
            if(action.type){
                this.dispatch(action,{address,port})
            }
        })
        this.udp.on('listening',()=>{
            const address = this.udp.address()
            console.log('[信息]:upd监听完毕 端口是'+address.port)
        })
        // 区分种子节点和普通节点 普通节点端口0即可 随便一个空闲端口即可
        // 种子节点端口必须约定好
        const port  = Number(process.argv[2]||0)
        this.startNode(port)
    }

    startNode(port){
        this.udp.bind(port)
        if(port!==this.seed.port){
            if (fs.existsSync(this.remoteFile)) {
                let address = JSON.parse(fs.readFileSync(this.remoteFile))
                if (address.address && address.port) {
                  this.send({
                    type: 'byebye',
                    data: address
                  }, this.seed.port, this.seed.address)
                }
            }
            this.send({
                type: 'newpeer'
            },this.seed.port,this.seed.address)
            this.peers.push(this.seed)
        }
    }

    // 给特定节点发送udp信息
    send(message,port,address){
        this.udp.send(JSON.stringify(message),port,address)
    }

    // 广播信息
    boardcast(action){
        this.peers.forEach(v => {
            this.send(action,v.port,v.address)
        })
    }

    // 根据信息种类执行不同的行为
    dispatch(action,remote){
        switch(action.type){
            case 'newpeer':
                // 种子节点要做的事
                // 1.公网ip和port
                this.send({
                    type: 'remoteAddress',
                    data:remote
                },remote.port,remote.address)
                // 2.现在全部节点的列表
                this.send({
                    type: 'peerlist',
                    data:this.peers
                },remote.port,remote.address)
                // 3. 告诉所有已知节点 来了个新节点
                this.boardcast({
                    type: 'sayhi',
                    data: remote
                })
                // 4. 告诉现在区块链的数据
                this.send({
                    type: 'blockchain',
                    data: JSON.stringify({
                        blockchain:this.blockchain,
                        trans: this.data
                    })
                },remote.port,remote.address)
                this.peers.push(remote)
                console.log('hello',remote)
                break
            case 'peerlist':
                const newPeers = action.data
                this.addPeers(newPeers)
                break
            case 'blockchain':
                let allData = JSON.parse(action.data)
                let newData = allData.blockchain
                let newTrans = allData.trans
                this.replaceChain(newData)
                this.replaceTrans(newTrans)
                break
            case 'remoteAddress':
                this.remote = action.data
                fs.writeFileSync(this.remoteFile, JSON.stringify(action.data))
                break
            case 'sayhi':
                let remotePeer = action.data
                this.peers.push(remotePeer)
                console.log('[信息] 你好')
                this.send({type:'hi',data:'hi'},remotePeer.port,remotePeer.address)
                break
            case 'hi':
                console.log(`${remote.address}:${remote.port}:${action.data}`)
                break
            case 'byebye':
                const target = action.data
                let i = this.peers.findIndex(v => v.address === target.address && v.port === target.port)
                if (i > -1) {
                    this.peers.splice(i, 1)
                    // 有的话 在广播一次 怕udp打洞失败
                    this.boardcast(action)
                }
                break
            case 'trans':
                if(!this.data.find(v => this.isEqualObj(v,action.data))){
                    console.log('[新的交易]')
                    this.addTrans(action.data)
                    this.boardcast({type:'trans',data:action.data})
                }
                break
            case 'mine':
                // 网络上有人挖矿成功
                const lastBlock = this.getLastBlock()
                if(lastBlock.hash===action.data.hash){
                    // 重复的消息
                    return
                }
                var temp = this.isValidBlock(action.data,lastBlock)
                console.log(JSON.stringify(action.data))
                console.log(JSON.stringify(lastBlock))
                if(temp.result){
                    console.log('[信息]: 有人挖矿成功')
                    this.blockchain.push(action.data)
                    // 清空本地信息
                    this.data = []
                    // 防止有人没收到再发一次
                    this.boardcast({
                        type: 'mine',
                        data:action.data
                    })
                }else{
                    console.log(`[非法挖矿区块信息]:${temp.reason}`)
                }
                break
            default:
                console.log(action.type)
        }
    }

    // 判断两个对象是否一样
    isEqualObj(obj1,obj2){
        const key1 = Object.keys(obj1)
        const key2 = Object.keys(obj2)
        if(key1.length!==key2.length){
            return false
        }
        return key1.every(key => obj1[key]===obj2[key])
    }
    isEqualPeer(peer1,peer2){
        return peer1.address===peer2.address&&peer1.port===peer2.port
    }

    // 添加新节点
    addPeers(peers){
        peers.forEach(peer => {
            if(!this.peers.find(v => this.isEqualPeer(v,peer))){
                this.peers.push(peer)
            }
        })
    }

    // 绑定程序终止事件
    bindExit(){
        process.on('exit',function(){
            console.log('exit')
        })
    }

    // 获取最新区块
    getLastBlock(){
        return this.blockchain[this.blockchain.length-1]
    }

    // 交易
    transfer(from,to,amount){
        const timestamp = new Date().getTime()
        const signature = rsa.sign({from,to,amount,timestamp})
        const sigTrans = {from,to,amount,timestamp,signature}
        if(from!==0){
            // 交易非挖矿
            const blance = this.blance(from)
            if(blance<amount){
                console.log('not enough blance',from,blance,amount)
                return
            }
            this.boardcast({
                type: 'trans',
                data: sigTrans
            })
        }
        this.data.push(sigTrans)
        return sigTrans
    }


    // 查看余额
    blance(address){
        let blance = 0
        this.blockchain.forEach(block => {
            if(!Array.isArray(block.data)){
                // 创世区块
                return 
            }
            block.data.forEach(trans => {
                if(address===trans.from){
                    blance -= trans.amount
                }
                if(address===trans.to){
                    blance += trans.amount
                }
            })
        })
        return blance
    }

    // 添加交易
    addTrans(trans){
        if(this.isValidTransfer(trans)){
            this.data.push(trans)
        }
    }

    // 判断某交易是否被篡改过
    isValidTransfer(trans){
        // 是不是合法的转账 地址即公钥
        return rsa.verify(trans,trans.from)
    }

    // 挖矿
    mine(address){
        // 校验所有交易合法性
        if(!this.data.every(v => this.isValidTransfer(v))){
            console.log('trans not valid')
            return
        }
        // 1.生成新区块
        // 2.不停的计算hash,直到计算出符合条件的hash
        // 挖矿结束矿工奖励
        this.transfer(0,address,100)
        const newBlock = this.generateNewBlock()
        // 区块合法, 就新增一下
        var temp1 = this.isValidBlock(newBlock)
        var temp2 = this.isValidChain(this.blockchain)
        if(!temp1.result){
            console.log('Error,Invalid Block',newBlock)
            console.log(temp1.reason)
        }else if(!temp2.result){
            console.log('Error,Invalid Block',newBlock)
            console.log(temp2.reason)
        }else{
            this.blockchain.push(newBlock)
            this.data = []
            console.log('[信息] 挖矿成功')
            this.boardcast({
                type: 'mine',
                data: newBlock
            })
        }
        return newBlock
    }

    // 生成新区块
    generateNewBlock(){
        let nonce = 0
        const index = this.blockchain.length // 区块索引值
        const data = this.data
        const prevHash = this.getLastBlock().hash
        let timestamp = new Date().getTime()
        let hash = this.computeHash(index,prevHash,timestamp,data,nonce)
        while(hash.slice(0,this.difficulty)!=='0'.repeat(this.difficulty)){
            nonce += 1
            hash = this.computeHash(index,prevHash,timestamp,data,nonce)
        }
        return {
            index,
            prevHash,
            timestamp,
            data,
            nonce,
            hash
        }
    }

    // 和computeHash功能一样,为了懒只给一个参数
    computeHashForBlock({index,prevHash,timestamp,data,nonce}){
        return this.computeHash(index,prevHash,timestamp,data,nonce)
    }

    // 计算哈希
    computeHash(index,prevHash,timestamp,data,nonce){
        return crypto
        .createHash('sha256')
        .update(index+prevHash+timestamp+data+nonce)
        .digest('hex')

    }

    // 校验区块
    isValidBlock(newBlock,lastBlock = this.getLastBlock()){
        // 1. 区块的index等于最新区块的index+1
        // 2. 区块的time大于最新区块
        // 3. 最新区块的prevHash等于上一区块的hash
        // 4. 区块的哈希值 符合难度要求
        // 5. 新区快的哈希值计算正确
        if(newBlock.index !== lastBlock.index+1){
            return {result:false,reason:'区块的index不等于最新区块的index+1'}
        }else if(newBlock.timestamp<lastBlock.timestamp){
            return {result:false,reason:'区块的time不大于最新区块'}
        }else if(newBlock.prevHash!==lastBlock.hash){
            return {result:false,reason:'最新区块的prevHash不等于上一区块的hash'}
        }else if(newBlock.hash.slice(0,this.difficulty)!=='0'.repeat(this.difficulty)){
            return {result:false,reason: '区块的哈希值符合不难度要求'}
        }else if(newBlock.hash!==this.computeHashForBlock(newBlock)){
            return {result:false,reason:'新区快的哈希值计算不正确'}
        }
        return {result:true}
    }

    // 校验区块链
    isValidChain(chain=this.blockchain){
        // 除创世区块外的区块
        for(let i=chain.length-1;i>=1;i=i-1){
            var temp = this.isValidBlock(chain[i],chain[i-1])
            if(!temp.result){
                return {result:false,reason:`${i-1}和${i}区块发生问题:${temp.reason}`}
            }
        }
        if(JSON.stringify(chain[0])!==JSON.stringify(initBlock)){
            return {result:false,reason: '创世区块被修改'}
        }
        return {result:true}
    }

    // 用新的交易覆盖旧的
    replaceTrans(trans){
        if(trans.every(v => this.isValidTransfer(v))){
            this.data = trans
        }
    }

    // 用新的区块链覆盖旧的
    replaceChain(newChain){
        if(newChain.length===1){
            return
        }
        var temp = this.isValidChain(newChain)
        if(temp.result&&newChain.length>this.blockchain.length){
            this.blockchain = JSON.parse(JSON.stringify(newChain))
        }else{
            console.log(`[错误]:${temp.reason}`)
        }
    }

}

// 导出
module.exports = Blockchain