var EC = require('elliptic').ec
var fs = require('fs')
var path = require('path')
var ec = new EC('secp256k1')
var keypair = ec.genKeyPair()

//  根据私钥生成公钥
function getPub(prv){
    return ec.keyFromPrivate(prv).getPublic('hex').toString()
}

// 1.获取公私钥队(持久化)
function generateKeys(){
    const fileName = path.resolve(__dirname,'wallet.json')
    try{
        let res = JSON.parse(fs.readFileSync(fileName))
        if(res.prv&&res.pub&&getPub(res.prv)===res.pub){
            keypair = ec.keyFromPrivate(res.prv)
            return res
        }else{
            throw new Error('not valid wallet.json')
        }
    }catch(error){
        console.log(error)
        let res = {
            prv: keypair.getPrivate('hex').toString(),
            pub: keypair.getPublic('hex').toString()
        }
        fs.writeFileSync(fileName,JSON.stringify(res))
        return res
    }
}

// 2. 签名
function sign({from,to,timestamp,amount}){
    const bufferMsg = Buffer.from(`${timestamp}-${amount}-${from}-${to}`)
    let signature = Buffer.from(keypair.sign(bufferMsg).toDER()).toString('hex')
    return signature
}

// 3. 校验签名
function verify({from,to,amount,timestamp,signature},pub){
    // 校验是没有私钥的
    const keypairTemp = ec.keyFromPublic(pub,'hex')
    const bufferMsg = Buffer.from(`${timestamp}-${amount}-${from}-${to}`)
    return keypairTemp.verify(bufferMsg,signature)
}

const keys = generateKeys()
// const trans = {from: 'w',to:'imooc',amount:100}
// const signature = sign(trans)
// trans.signature = signature
// verify(trans,keys.pub)

module.exports = {sign,verify,keys}