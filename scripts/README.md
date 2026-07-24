# scripts/

本目录存放生活相关的自动化脚本。

## 脚本列表

| 脚本 | 用途 |
|------|------|
| [`wlxy-auto-player.user.js`](wlxy-auto-player.user.js) | 成都职业培训网络学院 - 自动连播助手 |

---

# 成都职业培训网络学院 - 自动连播助手

## 背景

成都市专业技术人员继续教育（公需科目）在线培训平台，要求学员完整观看所有视频课程，**不允许跳过、不允许倍速**。

课程规模：
- **12 门课，48 个小节**
- 每节约 45 分钟
- 总计约 **36 小时**

本脚本自动检测视频播放完毕并切换到下一集，实现无人值守的完整播放。

## 安装方式

### 方式一：Tampermonkey（推荐，持久化）

1. 安装 [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) 扩展（Chrome/Edge/Firefox 均支持）
2. 打开 Tampermonkey → **创建新脚本**
3. 将 [`wlxy-auto-player.user.js`](wlxy-auto-player.user.js) 的全部内容粘贴进去
4. `Ctrl+S` 保存
5. 打开课程页面，脚本自动生效

> 每次打开课程页面脚本都会自动加载，无需重复操作。

### 方式二：浏览器 Console 注入（临时）

如果不想装扩展，也可以每次手动注入：

1. 打开课程页面
2. `F12` 打开开发者工具 → **Console** 标签
3. 粘贴下方代码并回车：

```javascript
// 迷你版自动播放脚本
(function(){
  function P(){const a=document.querySelector('#app').__vue__;function f(v,d){if(d>6||!v)return null;const m=v.$options?.methods;if(m&&m.startLearningSocket&&m.onPlayItem)return v;if(v.$children){for(const c of v.$children){const r=f(c,d+1);if(r)return r}}return null}return f(a,0)}
  function Q(){try{return TCPlayer?.getPlayers?.()?.['video_container']}catch(e){return null}}

  let R=false,S=null,C=0;

  function upd(){
    const c=P();if(!c)return;let done=0,tot=0;
    for(const r of c.ListML)for(const ch of r.listChapter){tot++;if(ch.state===3)done++}
    const id=id=>document.getElementById(id);
    const o=id('wlxy-overlay');if(o)o.textContent=R?`▶️ 运行中 | ${c.TitlePaly||''}| 剩余${Math.floor(((Q()?.duration?.()||0)-(Q()?.currentTime?.()||0))/60)}min`:done>=tot?'✅ 全部完成!':'🟢 就绪';
    const co=id('wlxy-count');if(co)co.textContent=`${done}/${tot}`;
    const ba=id('wlxy-bar');if(ba)ba.style.width=`${Math.round(done/tot*100)}%`;
    if(done>=tot&&R){R=false;clearInterval(S)}
  }

  function nxt(c){
    let rr=-1,cc=-1;
    for(let r=0;r<c.ListML.length;r++)for(let i=0;i<c.ListML[r].listChapter.length;i++)if(c.ListML[r].listChapter[i].courseChapterId===c.chapterId){rr=r;cc=i}
    if(rr>=0)for(let i=cc+1;i<c.ListML[rr].listChapter.length;i++)if(c.ListML[rr].listChapter[i].state!==3)return{ri:rr,ci:i,ch:c.ListML[rr].listChapter[i]};
    for(let r=rr+1;r<c.ListML.length;r++)for(let i=0;i<c.ListML[r].listChapter.length;i++)if(c.ListML[r].listChapter[i].state!==3)return{ri:r,ci:i,ch:c.ListML[r].listChapter[i]};
    return null
  }

  // 创建控制面板
  const p=document.createElement('div');p.id='wlxy-panel';
  p.style.cssText='position:fixed;bottom:20px;right:20px;z-index:999999;background:#1a1a2e;color:#eee;padding:14px 16px;border-radius:12px;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:240px;border:1px solid rgba(79,195,247,0.3);font-family:-apple-system,sans-serif';
  p.innerHTML='<div style="font-weight:bold;font-size:14px;margin-bottom:8px;color:#4FC3F7;">🤖 自动连播</div><div style="font-size:12px;margin-bottom:4px;">📊 <span id="wlxy-count">-/48</span> (<span id="wlxy-pct">0</span>%)</div><div style="margin:6px 0;background:#333;border-radius:4px;height:6px;"><div id="wlxy-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#4FC3F7,#69F0AE);border-radius:4px;"></div></div><div style="font-size:11px;color:#999;margin-bottom:8px;" id="wlxy-status">⏳ 就绪</div><div style="display:flex;gap:8px;"><button id="wlxy-go" style="flex:1;background:#4CAF50;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">▶ 启动</button><button id="wlxy-halt" style="flex:1;background:#f44336;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;" disabled>⏹ 停止</button></div><div style="margin-top:8px;font-size:11px;">倍速:<select id="wlxy-spd" style="background:#333;color:#fff;border:1px solid:#555;border-radius:4px;padding:2px 6px;margin-left:4px;"><option value="1">1x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></div>';
  document.body.appendChild(p);
  const ov=document.createElement('div');ov.id='wlxy-overlay';
  ov.style.cssText='position:fixed;top:12px;right:12px;z-index:999998;background:rgba(0,0,0,0.8);color:#4FC3F7;padding:6px 12px;border-radius:6px;font-size:12px;font-family:monospace;pointer-events:none';
  ov.textContent='🟢 就绪';document.body.appendChild(ov);

  let spd=1;
  document.getElementById('wlxy-go').onclick=()=>{
    R=true;C=10;
    const v=document.querySelector('video'),q=Q();if(v)v.playbackRate=spd;if(q)try{q.playbackRate(spd)}catch(e){}
    S=setInterval(()=>{
      if(!R){clearInterval(S);return}
      const c=P(),q=Q(),v=document.querySelector('video');
      if(!c||!q)return;
      if(v&&Math.abs(v.playbackRate-spd)>0.1){v.playbackRate=spd;try{q.playbackRate(spd)}catch(e){}}
      const cb=document.querySelector('.cancel_zx_class');if(cb)cb.click();
      upd();
      if(C>0){C--;return}
      const ct=q.currentTime(),dur=q.duration();
      if(dur>0&&q.paused()&&ct>=dur-1&&c.playStatus!=='pause'){
        const nx=nxt(c);
        if(nx){c.onPlayItem(nx.ch,nx.ri,nx.ci);C=15;
        setTimeout(()=>{const v=document.querySelector('video');if(v)v.playbackRate=spd},5000)}
        else{R=false;clearInterval(S);upd()}
      }
    },3000);
    document.getElementById('wlxy-go').disabled=true;
    document.getElementById('wlxy-halt').disabled=false;
  };
  document.getElementById('wlxy-halt').onclick=()=>{R=false;clearInterval(S);document.getElementById('wlxy-go').disabled=false;document.getElementById('wlxy-halt').disabled=true;upd()};
  document.getElementById('wlxy-spd').onchange=function(){spd=parseFloat(this.value);const v=document.querySelector('video');if(v)v.playbackRate=spd};
  console.log('%c[WLXY] %c脚本就绪，点击右下角启动','color:#4FC3F7;font-weight:bold','color:inherit');
})();
```

> 注意：关闭页面或刷新后需重新粘贴执行。

## 使用步骤

### 1. 登录并打开课程页面

1. 访问 [成都职业培训网络学院](https://www.wlxy.org.cn/)
2. 登录账号
3. 进入需要完成的培训课程页面（URL 类似 `/pages/train/play?data=...`）

### 2. 启动自动连播

脚本加载后，页面右下角会出现控制面板：

```
┌──────────────────────────────┐
│ 🤖 自动连播助手 v1.0         │
│                              │
│ 📺 当前: 十五五”规划解读01   │
│ 📊 总进度: 0/48 (0%)         │
│ ▓▓░░░░░░░░░░░░░░░░░░ 0%      │
│ ⏳ 就绪 - 点击启动           │
│                              │
│ ┌─────────┐ ┌─────────┐     │
│ │ ▶ 启动  │ │ ⏹ 停止  │     │
│ └─────────┘ └─────────┘     │
│ 倍速: [1x ▼]  建议1x保证完成 │
└──────────────────────────────┘
```

点击 **"▶ 启动"** 即可。

### 3. 挂机等待

启动后脚本会自动：
- 播放当前视频（1x 速度）
- 视频结束时自动切换下一节
- 关闭"是否继续上次播放"弹窗
- 跳过已完成章节
- 全部完成后自动停止

> **建议**：晚上睡前启动，早上起来检查。36 小时分 2-3 个晚上即可完成。

## 如何确认脚本在运行

有三种方式可以确认：

### ① 右上角浮层（最直观）

```
🟢 就绪           ← 未启动
▶️ 运行中 | 剩余 38:15 | 1x   ← 正在运行
✅ 全部完成!       ← 所有章节已完成
```

### ② 右下角控制面板

| 元素 | 说明 |
|------|------|
| 进度条 | 显示已完成章节占比，会随完成数增长 |
| 状态文字 | "▶️ 运行中" / "⏳ 就绪" / "🎉 全部完成" |
| "启动"按钮 | 变灰（disabled）表示正在运行 |
| "停止"按钮 | 可点击表示正在运行 |

### ③ F12 Console 日志

打开 Chrome 开发者工具（`F12` 或 `Cmd+Option+I`），切换到 **Console** 标签页，会看到彩色日志：

```
[WLXY Auto] 🚀 自动连播已启动!
[WLXY Auto] 📺 当前: 十五五”规划解读01
[WLXY Auto] ⚡ 倍速: 1x
[WLXY Auto] ⏱ 每3秒检测一次播放状态

... 视频播完时 ...

[WLXY Auto] ⏹ 视频播放完毕: 十五五”规划解读01
[WLXY Auto] ➡️ 切换到: 十五五”规划解读02
[WLXY Auto] ✅ 切换成功，等待视频加载...

... 全部完成时 ...

[WLXY Auto] 🎉 没有更多未完成章节！
```

日志前缀 `[WLXY Auto]` 为蓝色高亮，方便在大量日志中快速定位。

### ④ 切换音效（可选）

如果需要在后台标签页运行时也能感知切换，可以在 Console 中执行：

```javascript
// 开启切换提示音
window._wlxyBeep = true;
```

之后每次切换下一集时会发出一声短促的提示音。

## 配置说明

### 播放倍速

| 倍速 | 单节耗时 | 48 节总耗时 | 完成可靠性 | 说明 |
|------|----------|-------------|-----------|------|
| **1x** | 45 分钟 | **~36 小时** | ✅ 100% | 推荐，服务器完全认可 |
| 1.5x | 30 分钟 | ~24 小时 | ⚠️ 较高 | 轻量加速，风险低 |
| 2x | 22 分钟 | ~18 小时 | ⚠️ 中等 | 可能需多遍播放 |
| 4x+ | 11 分钟 | ~9 小时 | ❌ 低 | 服务器 `auditLength` 不足 |

> **为什么倍速可能无效？**
>
> 服务器通过 `auditLength`（实际累计观看时间）来验证，不是简单地检查播放进度。一个 45 分钟的视频如果只在 10 分钟内"看完"，服务器只会记录 10 分钟的有效时长。

### 参数修改（编辑脚本）

在 `wlxy-auto-player.user.js` 文件顶部可以修改：

```javascript
const CONFIG = {
  playbackRate: 1,        // 默认倍速
  checkInterval: 3000,    // 状态检测间隔（毫秒）
  debug: true,            // Console 日志开关
  autoStart: true,        // 是否打开页面就自动开始
  dismissContinue: true,  // 自动关闭"继续播放"弹窗
};
```

## 常见问题

### Q: 页面刷新后脚本还在吗？

- **Tampermonkey 方式**：还在，会自动重新注入
- **Console 注入方式**：不在了，需要重新粘贴执行

### Q: 电脑休眠/合盖后还会继续吗？

不会。电脑休眠后浏览器也会暂停，需要保持电脑唤醒状态。

**Mac 用户**：可以执行以下命令临时禁止休眠（脚本跑完后记得恢复）：

```bash
# 禁止休眠（运行期间）
caffeinate -i

# 或设置更长的休眠时间
sudo pmset -a sleep 0  # 跑完后恢复: sudo pmset -a sleep 10
```

**Windows 用户**：电源选项 → 关闭显示器设为"从不"，睡眠设为"从不"。

### Q: 视频加载失败或卡住怎么办？

脚本每 3 秒检测一次，如果发现以下情况会尝试恢复：
- 倍速被重置 → 自动恢复
- "继续播放"弹窗 → 自动关闭
- 视频加载失败 → 超时后尝试跳过

如果长时间卡住（超过 5 分钟），手动刷新页面重新开始即可。已完成 (`state=3`) 的章节会自动跳过。

### Q: 如何只播放某一门课？

在 Console 中找到对应资源索引后手动操作，或修改脚本中的 `findNextChapter` 逻辑限制范围。

### Q: 进度条显示完成但平台显示未完成？

检查网页右上角浮层是否显示 "✅ 全部完成"。如果脚本显示的完成数 `48/48` 但平台显示不一致，刷新页面后平台会从服务器拉取最新状态。

## 技术原理

本脚本基于对网站前端代码的逆向分析开发，以下是技术细节。

### 网站架构

```
┌──────────────────────────────────────────────────┐
│ 前端: Vue.js + TCPlayer (腾讯云点播)               │
│                                                    │
│ 视频: HLS 流媒体 (.m3u8/.ts)，通过腾讯 CDN 分发    │
│                                                    │
│ API: api.cdwork.cn                                 │
│   POST /train/socket/start_learning_socket         │
│   参数: token, courseChapterId, orgId,             │
│         authCode, currentTimes, playStatus         │
│   调用频率: 每 20 秒一次（心跳）                    │
└──────────────────────────────────────────────────┘
```

### 进度上报机制

1. 视频开始播放 → `onPlay()` → 发送 `playStatus=play`，启动 20 秒心跳定时器
2. 每 20 秒 → 发送 `currentTimes`（当前播放秒数）和 `playStatus`
3. 视频暂停 → `onPause()` → 发送 `playStatus=pause`，清除心跳定时器
4. 视频结束 → `onEnd()` → 发送 `playStatus=end`，清除心跳定时器
5. 切换章节 → `onPlayItem()` → 先发 `end`（sendBeacon），再加载新视频

### 服务器验证逻辑

通过多次测试验证，服务器采用的完成判定机制：

| 测试方法 | 结果 | 结论 |
|----------|------|------|
| 直接 API 伪造 `currentTimes=totalLength` | ❌ `state=2`, `auditLength=0` | 服务器不认一次性上报 |
| 模拟多次心跳 + API 伪造 | ❌ `state=2` | 不检查心跳次数 |
| 正常播放到结尾（12 分钟/45 分钟） | ⚠️ `state=2`, `progress=0.27` | 进度 = 实际时间/总时长 |
| 跳到最后 3 秒自然结束 | ⚠️ `state=2`, `progress=0.27` | 跳转不增加有效时长 |

**结论**：服务器通过 `auditLength`（前后端时间差累积）来计算真实观看进度。要获得 100% 进度，需要真实地让时间流逝约等于视频总时长。

### 章节切换逻辑

```
┌─────────────────────────────────────────────────┐
│  检测视频结束 (paused && currentTime ≈ duration) │
│       │                                          │
│       ▼                                          │
│  查找当前章节在 ListML 中的位置                   │
│       │                                          │
│       ▼                                          │
│  同资源内有下一节？ ──是──▶ 跳到同资源下一节      │
│       │否                                        │
│       ▼                                          │
│  下一资源有第一节？ ──是──▶ 跳到下一资源第一节    │
│       │否                                        │
│       ▼                                          │
│  从头找第一个 state≠3 的 ──是──▶ 补漏            │
│       │否                                        │
│       ▼                                          │
│  🎉 全部完成                                     │
└─────────────────────────────────────────────────┘
```

### 文件结构

```
scripts/
├── README.md                     ← 本文件
└── wlxy-auto-player.user.js     ← Tampermonkey 脚本（带控制面板 UI）
```
