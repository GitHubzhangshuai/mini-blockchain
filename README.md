## 运行种子节点
```
npm run seed
```

## 运行普通节点
```
npm run dev
```
## 本demo是为了更好的理解区块链原理
* 公钥由私钥生成,公钥即地址
* 节点之间采用p2p方式连接,连接之前需要运行种子节点,连接之后关闭种子节点不影响已经建立的连接
* 转账交易需挖矿成功后才可添加到区块链
* 发送放用私钥把转账金额时间戳一系列信息打包成签名后连同信息和公钥一起发送,接收方通过公钥计算信息是否与一样签名来达到验证

### 对产生的新区快校验:
* 1. 区块的index等于最新区块的index+
* 2. 区块的time大于最新区块
* 3. 最新区块的prevHash等于上一区块的hash
* 4. 区块的哈希值 符合难度要求
* 5. 新区快的哈希值计算正确

welcome to mini-blockchain
```
  Commands:

    help [command...]    Provides help for a given command.
    exit                 Exits application.
    mine                 挖矿
    trans <to> <amount>  转账
    detail <index>       查看区块链
    blance <address>     查看账号余额
    blockchain           查看区块详情
    pub                  查看本地公钥
    pending              查看没有被打包的交易
    chat <msg>           和别的节点打招呼
    peers                查看网络节点列表
```