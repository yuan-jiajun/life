// ==UserScript==
// @name         成都职业培训网络学院 - 自动连播助手
// @namespace    https://www.wlxy.org.cn/
// @version      1.0
// @description  自动检测视频播放完毕并切换到下一集，支持调速、防检测、进度追踪
// @author       Claude
// @match        https://www.wlxy.org.cn/pages/train/play*
// @match        https://www.wlxy.org.cn/pages/course/play*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ====================== 配置 ======================
  const CONFIG = {
    playbackRate: 1,        // 播放倍速 (1-16, 建议1-4以避免被检测)
    checkInterval: 3000,    // 状态检测间隔(ms)
    seekToEnd: false,       // 是否直接跳到结尾 (true=快速刷, false=老实看完)
    seekThreshold: 10,      // 跳到离结尾多少秒 (仅 seekToEnd=true 时有效)
    debug: true,            // 是否显示调试信息
    autoStart: true,        // 是否自动开始
    dismissContinue: true,  // 自动关闭"继续上次播放"弹窗
  };

  // ====================== 状态 ======================
  let running = false;
  let currentResourceIdx = 0;
  let currentChapterIdx = 0;
  let completedCount = 0;
  let totalChapters = 0;
  let statsTimer = null;

  // ====================== 工具函数 ======================
  function log(...args) {
    if (CONFIG.debug) console.log('[WLXY Auto]', ...args);
  }

  function getPlayerComponent() {
    try {
      const app = document.querySelector('#app').__vue__;
      // 递归查找：找到同时有 startLearningSocket 和 onPlayItem 方法的组件
      function find(vm, depth) {
        if (depth > 6 || !vm) return null;
        const methods = vm.$options?.methods;
        if (methods && 'startLearningSocket' in methods && 'onPlayItem' in methods) return vm;
        if (vm.$children) {
          for (const child of vm.$children) {
            const f = find(child, depth + 1);
            if (f) return f;
          }
        }
        return null;
      }
      return find(app, 0);
    } catch (e) {
      return null;
    }
  }

  function getTCPlayer() {
    try {
      return TCPlayer?.getPlayers?.()?.['video_container'];
    } catch (e) {
      return null;
    }
  }

  function getVideoEl() {
    return document.querySelector('video');
  }

  // ====================== 核心逻辑 ======================

  function waitForReady(maxWait = 30000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = setInterval(() => {
        const comp = getPlayerComponent();
        const player = getTCPlayer();
        const video = getVideoEl();

        if (comp && player && video && comp.ListML?.length > 0) {
          clearInterval(check);
          log('页面就绪');
          resolve({ comp, player, video });
        } else if (Date.now() - start > maxWait) {
          clearInterval(check);
          log('等待超时，刷新页面重试...');
          location.reload();
          resolve(null);
        }
      }, 500);
    });
  }

  function setupPlaybackRate(video, player) {
    const rate = CONFIG.playbackRate;
    try {
      video.playbackRate = rate;
      player.playbackRate(rate);
      log(`播放速度设置为 ${rate}x`);
    } catch (e) {
      log('设置播放速度失败:', e);
    }
  }

  // 维护倍速 (防止被重置)
  function maintainPlaybackRate() {
    const video = getVideoEl();
    const player = getTCPlayer();
    if (video && player) {
      const currentRate = video.playbackRate;
      if (Math.abs(currentRate - CONFIG.playbackRate) > 0.1) {
        video.playbackRate = CONFIG.playbackRate;
        try { player.playbackRate(CONFIG.playbackRate); } catch (e) { }
        log(`倍速已恢复: ${CONFIG.playbackRate}x (之前 ${currentRate.toFixed(1)}x)`);
      }
    }
  }

  function dismissContinueDialog() {
    // 查找"是否继续上次播放"弹窗
    const dialog = document.querySelector('.el-message-box__wrapper');
    if (!dialog) return false;

    const title = dialog.querySelector('.el-message-box__title');
    if (title && title.textContent.includes('提示')) {
      const cancelBtn = dialog.querySelector('.cancel_zx_class');
      if (cancelBtn) {
        log('自动关闭"继续上次播放"弹窗');
        cancelBtn.click();
        return true;
      }
    }
    return false;
  }

  function dismissAllDialogs() {
    // 通用弹窗关闭
    const closeButtons = document.querySelectorAll('.el-message-box__close, .el-message-box__headerbtn');
    closeButtons.forEach(b => {
      try {
        // 只关闭可能干扰的弹窗
        const wrapper = b.closest('.el-message-box__wrapper');
        if (wrapper && wrapper.style.display !== 'none') {
          const title = wrapper.querySelector('.el-message-box__title');
          if (title && (title.textContent.includes('提示') || title.textContent.includes('错误'))) {
            b.click();
            log('关闭弹窗:', title.textContent);
          }
        }
      } catch (e) { }
    });
  }

  function findChapterPosition(comp, chapterId) {
    for (let r = 0; r < comp.ListML.length; r++) {
      const resource = comp.ListML[r];
      for (let c = 0; c < resource.listChapter.length; c++) {
        if (resource.listChapter[c].courseChapterId === chapterId) {
          return { resourceIdx: r, chapterIdx: c, resource, chapter: resource.listChapter[c] };
        }
      }
    }
    return null;
  }

  function findNextChapter(comp) {
    // 先找当前播放的章节
    const currentPos = findChapterPosition(comp, comp.chapterId);
    if (!currentPos) {
      // 从头开始找第一个未完成的
      for (let r = 0; r < comp.ListML.length; r++) {
        for (let c = 0; c < comp.ListML[r].listChapter.length; c++) {
          if (comp.ListML[r].listChapter[c].state !== 3) {
            return {
              resourceIdx: r,
              chapterIdx: c,
              chapter: comp.ListML[r].listChapter[c],
            };
          }
        }
      }
      return null; // 全部完成
    }

    const { resourceIdx, chapterIdx } = currentPos;

    // 先尝试同一资源内的下一节
    if (chapterIdx + 1 < comp.ListML[resourceIdx].listChapter.length) {
      return {
        resourceIdx,
        chapterIdx: chapterIdx + 1,
        chapter: comp.ListML[resourceIdx].listChapter[chapterIdx + 1],
      };
    }

    // 下一资源的第一节
    if (resourceIdx + 1 < comp.ListML.length) {
      return {
        resourceIdx: resourceIdx + 1,
        chapterIdx: 0,
        chapter: comp.ListML[resourceIdx + 1].listChapter[0],
      };
    }

    return null; // 全部完成
  }

  function countCompleted(comp) {
    let count = 0;
    let total = 0;
    for (const resource of comp.ListML) {
      for (const chapter of resource.listChapter) {
        total++;
        if (chapter.state === 3) count++;
      }
    }
    return { completed: count, total };
  }

  // 检查视频是否真的播完了
  // 注意：TCPlayer 事件触发顺序是 pause → ended（不是 ended → pause），
  // 所以 onPause 会先执行把 playStatus 设为 "pause"，不能通过 playStatus 区分手动暂停和自然结束。
  // 正确做法：用 video.ended 属性（浏览器原生，自然结束才为 true）。
  function isVideoEnded(comp) {
    const player = getTCPlayer();
    const video = getVideoEl();

    if (!player || !video) return false;

    const ct = player.currentTime();
    const dur = player.duration();
    const paused = player.paused();

    // video.ended：只有视频自然播放到结尾才为 true，手动暂停为 false
    // 这是区分"播完了"和"手动暂停"的最可靠方式
    if (dur > 0 && paused && video.ended) {
      return true;
    }

    // 兜底：time 和 duration 都就绪时，当前时间已经到了结尾
    if (dur > 0 && paused && ct >= dur - 1) {
      return true;
    }

    // 异常情况：组件已经完全清空（AllClearEmpty已调用）
    if (comp.playStatus === '' && comp.intervalTime === null && !comp.isLoading) {
      return true;
    }

    return false;
  }

  function navigateToChapter(comp, next) {
    if (!next) return false;
    log(`切换到: ${next.chapter.courseChapterTitle} (资源${next.resourceIdx}, 章节${next.chapterIdx})`);
    try {
      comp.onPlayItem(next.chapter, next.resourceIdx, next.chapterIdx);
      currentResourceIdx = next.resourceIdx;
      currentChapterIdx = next.chapterIdx;
      return true;
    } catch (e) {
      log('切换章节失败:', e);
      return false;
    }
  }

  // 确保视频在播放：关闭弹窗 + 绕过 TCPlayer 直接用原生 API 突破 autoplay 限制
  // 注意：不能用 TCPlayer 的 muted()/play()，因为 TCPlayer 内部状态管理可能导致
  // 静音状态不同步、play() 失败后不重试。直接操作原生 <video> 元素最可靠。
  function ensureVideoPlaying(retries = 5) {
    const tryPlay = () => {
      const video = getVideoEl();
      if (!video) return false;

      // 1. 先处理"继续上次播放"弹窗
      const cancelBtn = document.querySelector('.cancel_zx_class');
      if (cancelBtn) {
        log('自动关闭"继续播放"弹窗');
        cancelBtn.click();
        // 弹窗关闭后 onCanplay 的 catch 回调会执行 player.play()，
        // 但可能被 autoplay 拦截，所以下面继续兜底
      }

      // 2. 已经在播放了就什么都不用做
      if (!video.paused && video.currentTime > 0) {
        return true;
      }

      // 3. 直接静音播放 — 挂机不需要声音，静音不受 Chrome autoplay 限制
      video.muted = true;
      video.play()?.catch((e) => {
        log('播放失败:', e.message);
      });

      // 同时通过 TCPlayer 启动心跳（让服务器知道在播放）
      const comp = getPlayerComponent();
      if (comp && comp.playStatus !== 'play') {
        comp.playStatus = 'play';
        if (!comp.intervalTime) {
          comp.intervalTime = setInterval(() => { comp.startLearningSocket(); }, 20000);
        }
        comp.startLearningSocket('play');
      }

      return !video.paused;
    };

    // 立即尝试 + 延迟重试
    if (tryPlay()) return;

    let attempts = 0;
    const retryInterval = setInterval(() => {
      attempts++;
      if (tryPlay() || attempts >= retries) {
        clearInterval(retryInterval);
        if (attempts >= retries) log('⚠️ 多次重试后仍无法播放，请手动点击播放');
      }
    }, 2000);
  }

  function updateStats(comp) {
    const stats = countCompleted(comp);
    completedCount = stats.completed;
    totalChapters = stats.total;

    // 更新侧边栏的视觉状态
    for (const resource of comp.ListML) {
      for (const chapter of resource.listChapter) {
        if (chapter.courseChapterId === comp.chapterId && chapter.state !== 3) {
          // 当 playStatus 是 'play' 时标记为学习中
          if (comp.playStatus === 'play' && chapter.state !== 2) {
            comp.$set(chapter, 'state', 2);
          }
        }
      }
    }
  }

  function showProgressOverlay(comp) {
    const stats = countCompleted(comp);
    let overlay = document.getElementById('wlxy-progress-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'wlxy-progress-overlay';
      overlay.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 99999;
        background: rgba(0,0,0,0.85); color: #fff; padding: 12px 16px;
        border-radius: 8px; font-size: 13px; font-family: monospace;
        pointer-events: none; max-width: 260px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(overlay);
    }

    const pct = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0;
    const currentTitle = comp.TitlePaly || '加载中...';
    const rate = getVideoEl()?.playbackRate || 1;

    overlay.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;color:#4FC3F7;">🤖 自动连播中</div>
      <div>📺 ${currentTitle}</div>
      <div>📊 进度: ${stats.completed}/${stats.total} (${pct}%)</div>
      <div>⚡ 倍速: ${rate}x</div>
      <div style="margin-top:4px;background:#333;border-radius:4px;height:6px;">
        <div style="width:${pct}%;height:100%;background:#4FC3F7;border-radius:4px;"></div>
      </div>
      <div style="font-size:11px;color:#999;margin-top:4px;">
        ${stats.completed >= stats.total ? '✅ 全部完成!' : '⏳ 自动进行中...'}
      </div>
    `;
  }

  // ====================== 主循环 ======================

  async function mainLoop() {
    const ready = await waitForReady();
    if (!ready) return;

    const { comp, player, video } = ready;
    running = true;
    log('自动连播已启动');

    // 初始化统计
    updateStats(comp);
    showProgressOverlay(comp);

    // 设置初始倍速
    setupPlaybackRate(video, player);

    // 主检测循环
    let lastChapterId = comp.chapterId;
    let switchCooldown = 0;

    const loopInterval = setInterval(() => {
      if (!running) {
        clearInterval(loopInterval);
        return;
      }

      // 维护倍速
      maintainPlaybackRate();

      // 处理弹窗
      if (CONFIG.dismissContinue) {
        dismissContinueDialog();
      }

      // 意外暂停自动恢复（非正常结束的暂停）
      const video = getVideoEl();
      if (video && video.paused && !video.ended && comp.playStatus === 'pause' && comp.intervalTime === null) {
        const dur = player.duration();
        const ct = player.currentTime();
        // 不是结尾的暂停 = 意外暂停，自动恢复
        if (dur > 0 && ct < dur - 5) {
          log('检测到意外暂停，自动恢复播放');
          comp.playStatus = 'play';
          comp.startLearningSocket('play');
          comp.intervalTime = setInterval(() => { comp.startLearningSocket(); }, 20000);
          // 静音播放恢复（不受 autoplay 限制）
          video.muted = true;
          video.play()?.catch(() => {});
        }
      }

      // 更新进度显示
      updateStats(comp);
      showProgressOverlay(comp);

      // 冷却时间
      if (switchCooldown > 0) {
        switchCooldown--;
        return;
      }

      // 检查是否播放完毕
      const ended = isVideoEnded(comp);

      // seek模式：直接跳到结尾
      if (CONFIG.seekToEnd && !ended && comp.playStatus === 'play') {
        const dur = player.duration();
        const ct = player.currentTime();
        if (dur > 0 && ct < dur - CONFIG.seekThreshold) {
          log(`跳过中间内容: ${Math.floor(ct)}s → ${Math.floor(dur - CONFIG.seekThreshold)}s`);
          player.currentTime(dur - CONFIG.seekThreshold);
        }
      }

      if (ended) {
        log('视频播放完毕，查找下一集...');

        // 查找下一集
        const next = findNextChapter(comp);

        if (!next) {
          log('🎉 所有章节已完成！');
          running = false;
          clearInterval(loopInterval);
          updateStats(comp);
          showProgressOverlay(comp);

          // 全屏庆祝
          const overlay = document.getElementById('wlxy-progress-overlay');
          if (overlay) {
            overlay.style.background = 'rgba(0,150,0,0.9)';
            overlay.innerHTML = `
              <div style="font-weight:bold;font-size:16px;color:#69F0AE;">🎉 全部完成!</div>
              <div>📊 完成: ${completedCount}/${totalChapters}</div>
              <div style="margin-top:4px;">可以关闭此页面了</div>
            `;
          }
          return;
        }

        // 切换到下一集
        const switched = navigateToChapter(comp, next);
        if (switched) {
          lastChapterId = next.chapter.courseChapterId;
          switchCooldown = 10; // 30秒冷却 (10 × 3秒检测间隔)

          // 等新视频加载后确保播放 + 设置倍速
          setTimeout(() => {
            const newVideo = getVideoEl();
            const newPlayer = getTCPlayer();
            if (newVideo) {
              setupPlaybackRate(newVideo, newPlayer);
            }
            // 主动确保视频在播放（关闭弹窗+处理 autoplay 限制）
            ensureVideoPlaying();
          }, 3000);

          // 二次确保（兜底）
          setTimeout(() => {
            const newVideo = getVideoEl();
            const newPlayer = getTCPlayer();
            if (newVideo) {
              setupPlaybackRate(newVideo, newPlayer);
            }
            ensureVideoPlaying();
          }, 8000);
        }
      }
    }, CONFIG.checkInterval);

    // 返回控制句柄
    return {
      stop: () => {
        running = false;
        clearInterval(loopInterval);
      },
      interval: loopInterval,
    };
  }

  // ====================== 控制面板 ======================

  function createControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'wlxy-control-panel';
    panel.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 100000;
      background: #1a1a2e; color: #eee; padding: 16px;
      border-radius: 12px; font-size: 12px; font-family: sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      min-width: 220px;
    `;

    panel.innerHTML = `
      <div style="font-weight:bold;font-size:14px;margin-bottom:10px;color:#4FC3F7;">
        🎮 自动连播控制台
      </div>
      <div style="margin-bottom:6px;">
        <label>倍速: </label>
        <select id="wlxy-speed-select" style="background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 6px;">
          <option value="1" ${CONFIG.playbackRate === 1 ? 'selected' : ''}>1x (安全)</option>
          <option value="2" ${CONFIG.playbackRate === 2 ? 'selected' : ''}>2x</option>
          <option value="4" ${CONFIG.playbackRate === 4 ? 'selected' : ''}>4x (快速)</option>
          <option value="8" ${CONFIG.playbackRate === 8 ? 'selected' : ''}>8x</option>
          <option value="16" ${CONFIG.playbackRate === 16 ? 'selected' : ''}>16x (极限)</option>
        </select>
      </div>
      <div style="margin-bottom:6px;">
        <label>
          <input type="checkbox" id="wlxy-seek-mode" ${CONFIG.seekToEnd ? 'checked' : ''}>
          跳结尾模式
        </label>
      </div>
      <div style="margin-bottom:10px;">
        <button id="wlxy-start-btn" style="background:#4CAF50;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;margin-right:6px;">▶ 开始</button>
        <button id="wlxy-stop-btn" style="background:#f44336;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">⏹ 停止</button>
      </div>
      <div id="wlxy-status" style="color:#999;font-size:11px;">
        就绪 - 点击"开始"启动
      </div>
    `;

    document.body.appendChild(panel);

    // 事件绑定
    let loopControl = null;

    document.getElementById('wlxy-start-btn').addEventListener('click', async () => {
      document.getElementById('wlxy-status').textContent = '正在初始化...';
      loopControl = await mainLoop();
      if (loopControl) {
        document.getElementById('wlxy-status').textContent = '运行中...';
        document.getElementById('wlxy-start-btn').disabled = true;
        document.getElementById('wlxy-stop-btn').disabled = false;
      }
    });

    document.getElementById('wlxy-stop-btn').addEventListener('click', () => {
      if (loopControl) {
        loopControl.stop();
        loopControl = null;
      }
      running = false;
      document.getElementById('wlxy-status').textContent = '已停止';
      document.getElementById('wlxy-start-btn').disabled = false;
      document.getElementById('wlxy-stop-btn').disabled = true;
    });

    document.getElementById('wlxy-speed-select').addEventListener('change', (e) => {
      CONFIG.playbackRate = parseFloat(e.target.value);
      const video = getVideoEl();
      const player = getTCPlayer();
      if (video) video.playbackRate = CONFIG.playbackRate;
      if (player) player.playbackRate(CONFIG.playbackRate);
    });

    document.getElementById('wlxy-seek-mode').addEventListener('change', (e) => {
      CONFIG.seekToEnd = e.target.checked;
    });

    document.getElementById('wlxy-stop-btn').disabled = true;
  }

  // ====================== 启动 ======================

  function init() {
    log('脚本已加载');

    // 等待DOM和Vue初始化
    const checkReady = setInterval(() => {
      const comp = getPlayerComponent();
      if (comp && comp.ListML?.length > 0) {
        clearInterval(checkReady);
        log('页面就绪，创建控制面板');
        createControlPanel();

        if (CONFIG.autoStart) {
          log('自动启动模式');
          setTimeout(() => {
            document.getElementById('wlxy-start-btn')?.click();
          }, 2000);
        }
      }
    }, 500);

    // 超时处理
    setTimeout(() => {
      clearInterval(checkReady);
    }, 60000);
  }

  // 页面加载完成后初始化
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

})();
