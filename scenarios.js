/* 异常场景：PRD V2.3 6.3 的 24 个异常和分支，每个一键进入。
   企业和政策都是核对过公开来源的真实数据；真实数据触发不了的，用模拟开关（sim.js）。 */
(() => {
  'use strict';
  const E = value => window.PolicyUI.escape(value);
  const S = () => window.PolicyStore;
  const M = () => window.PolicyMatch;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(selector, ms = 12000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const found = document.querySelector(selector);
      if (found) return found;
      await sleep(150);
    }
    return null;
  }
  // 页面刷新会替换节点，点之前再取一次，避免点到已经被替换掉的旧按钮。
  async function press(selector) {
    if (!(await waitFor(selector))) return false;
    await sleep(400);
    const el = document.querySelector(selector);
    el?.click();
    return Boolean(el);
  }
  const JINJIAN = '北京久其金建科技有限公司';
  /* 新规则（手册第 2 节）：第一轮只填企业名称，其余按政策追问。FULL 是追问字段都填过的画像。 */
  const FULL = { revenue: '5000万-1亿', rdFee: '800' };

  // 建一个任务并跑到匹配结果；stop 为 'confirm' 时停在企业画像确认卡。
  async function mk(name, answers = {}, stop = '') {
    const task = S().createTask({ title: `${name} · 政策申报`, request: `为${name}查找适用政策并准备申报材料。`, company: { name, ...M().apiProfile(name) } });
    S().updateTask(task.id, { intake: { stage: 'confirm', answers, files: [] } });
    location.hash = `#task?task=${encodeURIComponent(task.id)}&work=match`;
    if (stop === 'confirm') { await waitFor('[data-action="intake-confirm"]'); return task.id; }
    await press('[data-action="intake-confirm"]');
    // 等匹配动画走完：“正在匹配中”消失后才有结果卡片。
    await sleep(800);
    const start = Date.now();
    while (document.querySelector('.chat-thread, main')?.innerText.includes('正在匹配中') && Date.now() - start < 25000) await sleep(250);
    await sleep(1200);
    return task.id;
  }
  async function openPolicy(policyId) {
    const selector = `[data-action="match-drawer"][data-policy="${policyId}"]`;
    // 已截止、暂未开放的政策可能不在结果列表里，直接打开它的解读。
    if (!(await waitFor(selector, 3000))) {
      const taskId = new URLSearchParams(location.hash.split('?')[1] || '').get('task') || '';
      const opener = Object.assign(document.createElement('button'), { type: 'button', hidden: true });
      Object.assign(opener.dataset, { action: 'match-drawer', task: taskId, policy: policyId });
      document.body.append(opener); opener.click(); opener.remove();
    } else await press(selector);
    return waitFor('#match-drawer .interpret-footer');
  }
  async function choosePolicy(policyId) {
    await openPolicy(policyId);
    await press('#match-drawer .interpret-footer .button-primary');
    await sleep(1200);
  }
  async function focus(selector) {
    const el = await waitFor(selector, 8000);
    if (!el) return;
    // 整个气泡放得下就居中；气泡比可视区高时，把要看的那块滚到顶部，免得落在屏幕外。
    const row = el.closest('.chat-message-row') || el;
    const view = row.closest('.chat-scroll-region') || document.scrollingElement;
    if (row.getBoundingClientRect().height <= (view.clientHeight || window.innerHeight) - 24) row.scrollIntoView({ block: 'center' });
    else el.scrollIntoView({ block: 'start' });
    await sleep(300);
    el.classList.add('scenario-flash');
    setTimeout(() => el.classList.remove('scenario-flash'), 2400);
  }
  async function guidanceFor(policyId) {
    const id = await mk(JINJIAN, FULL);
    await choosePolicy(policyId);
    location.hash = `#task?task=${encodeURIComponent(id)}&work=guidance`;
    await sleep(1200);
    return id;
  }

  const items = [
    { n: 1, stage: '信息采集', title: '查不到企业', how: '输入不完整的企业名称「北京久其金建科技公司」，工商信息查不到；全国范围的项目仍可查看，结果页顶部提示核对名称。', run: async () => { await mk('北京久其金建科技公司'); await focus('.company-notfound'); } },
    { n: 1, sub: '接口失败', stage: '信息采集', title: '企业接口失败或超时', how: '真实接口故障无法复现，用模拟开关。不提示核对名称，提示稍后重试。', sims: ['apiTimeout'], run: async () => { await mk(JINJIAN); await focus('.company-notfound'); } },
    { n: 2, stage: '信息采集', title: '企业已注销、吊销', how: '北京华宇信码技术有限公司，2026年6月29日完成注销登记（华宇软件公告）。按 G1 主体状态异常，全部政策不参与匹配。', run: async () => { await mk('北京华宇信码技术有限公司'); await focus('.match-nohit'); } },
    { n: 3, stage: '信息采集', title: '只填企业名称就确认', how: '新规则第一轮只有企业名称必填。久其金建不填其他字段，地区、行业等由企业地图自动带出，其余显示“待补充”。', run: async () => { await mk(JINJIAN, {}, 'confirm'); await focus('.portrait-confirm, [data-action="intake-confirm"]'); } },
    { n: 4, stage: '信息采集', title: '正在申报的政策少于 3 条', how: '上海久其软件有限公司：上海只有智能电网专项和全国揭榜挂帅 2 条正在申报，员工人数没有公开数据，按关键字段追问一轮。', run: async () => { await mk('上海久其软件有限公司'); await focus('.intake-followup'); } },
    { n: 5, stage: '匹配', title: '无命中', how: '成都久其软件有限公司选择“其他行业”：全国揭榜挂帅按 G4 行业限定筛掉，成都和四川没有正在申报的地方政策。', run: async () => { await mk('成都久其软件有限公司', { industry: '其他行业' }); await focus('.match-nohit'); } },
    { n: 6, stage: '匹配', title: '放宽条件后查到政策', how: '成都久其软件有限公司（其他行业）：放宽行业到软件信息后，查到全国揭榜挂帅项目。', run: async () => { await mk('成都久其软件有限公司', { industry: '其他行业' }); await press('[data-action="nohit-pick"][data-key="industry"]'); await sleep(300); await press('[data-action="nohit-confirm"]'); await focus('#match-result-heading'); } },
    { n: 7, stage: '匹配', title: '放宽后仍无结果', how: '成都久其软件有限公司（其他行业）：只扩大地区到四川省、行业不变，仍然没有，转人工客服。', run: async () => { await mk('成都久其软件有限公司', { industry: '其他行业' }); await press('[data-action="nohit-pick"][data-key="region"]'); await sleep(300); await press('[data-action="nohit-confirm"]'); await sleep(500); await press('[data-action="nohit-service"]'); await focus('.match-nohit'); } },
    { n: 8, stage: '匹配', title: '必备条件待补充', how: '郑州企业自主研发项目（科技口）要求研发费用总额不低于 50 万元，是必备条件。研发费用没填时不压档，诊断置顶提示“这是必备条件，请先补充”。北京企业按 G2 看不到这项政策，这里直开政策解读核对。', run: async () => { await mk(JINJIAN); await openPolicy('zz-self-rd-2026'); await focus('#match-drawer .interpret-diagnosis'); } },
    { n: 9, stage: '匹配', title: '严重失信，全部政策标低', how: '没有可公开核验的真实失信记录，用模拟开关。严重失信按“只扣不加”，所有政策档位标低，结果页顶部提示并给信用修复人工咨询入口。', sims: ['dishonest'], run: async () => { await mk(JINJIAN, FULL); await focus('.compliance-notice'); } },
    { n: 10, stage: '匹配', title: '政策没写金额', how: '郑州企业自主研发项目纳入市级科技计划，原文没有写资助金额，预估补贴显示“以原文为准”。', run: async () => { await mk(JINJIAN); await openPolicy('zz-self-rd-2026'); await focus('#match-drawer .interpret-overview'); } },
    { n: 11, stage: '诊断', title: '企业有经营异常记录', how: '没有找到可公开核验的真实记录，用模拟开关，记录上写明“模拟”。经营异常不压档，只在结果页顶部提示。', sims: ['risk'], run: async () => { await mk(JINJIAN, FULL); await focus('.compliance-notice'); } },
    { n: 12, stage: '解读', title: '提取字段置信度为中', how: '黄埔高技能人才补贴的电子材料 12 月 18 日截止、纸质 12 月 25 日截止，取纸质时间并标“以原文为准”。', run: async () => { await mk(JINJIAN); await openPolicy('gz-hp-skilled-2025'); await focus('#match-drawer .interpret-facts'); } },
    { n: 13, stage: '申报', title: '政策没有申报模板', how: '郑州企业自主研发项目在市科技业务管理系统在线填报，公开通知没有附模板，选它直接转到办理指引。', run: async () => { await mk(JINJIAN); await choosePolicy('zz-self-rd-2026'); await focus('.guidance-detail, .chat-message-row:last-child'); } },
    { n: 14, stage: '申报', title: '模板暂未收录', how: '黄埔高技能人才补贴：评分表等附件在原文页面，模板没有收进库表，提示从原文下载后上传。', run: async () => { await mk(JINJIAN); await choosePolicy('gz-hp-skilled-2025'); await focus('.template-missing'); } },
    { n: 15, stage: '申报', title: '严重不符', how: '选揭榜挂帅项目，放一份要点不全的申报书，预审提示建议暂缓申报。', run: async () => {
      const id = await mk(JINJIAN, FULL);
      await choosePolicy('bj-edz-jbgsh-2026');
      const task = S().getTask(id), sid = 'bj-edz-jbgsh-2026-apply-book', text = '项目名称：建筑工程数字化平台。本项目由企业研发团队承担。';
      const sources = task.sources.some(source => source.id === sid) ? task.sources.map(source => source.id === sid ? { ...source, provided: true, text, fileName: '项目申报书.docx' } : source) : [...task.sources, { id: sid, name: '项目申报书', type: 'project', provided: true, text, fileName: '项目申报书.docx' }];
      S().updateTask(id, { sources });
      location.hash = `#task?task=${encodeURIComponent(id)}&work=assembly`;
      await press(`[data-action="material-review"][data-source="${sid}"]`);
      await focus('.precheck');
    } },
    { n: 16, stage: '办理', title: '办理入口置信度低', how: '软件产品增值税即征即退（按纳税期常态办理）：2026年北京电子税务局的入口没有核实到，第一步改为确认办理渠道。', run: async () => { const id = await mk(JINJIAN, FULL); const task = S().getTask(id); S().updateTask(id, { policyId: 'cn-software-vat', interpretPolicyId: 'cn-software-vat', steps: { ...task.steps, match: true, diagnosis: true } }); location.hash = `#task?task=${encodeURIComponent(id)}&work=guidance`; await press('.guidance-step'); await focus('.guidance-detail'); } },
    { n: 17, stage: '办理', title: '邮件报送打不开', how: '揭榜挂帅的办理指引（申报书发主管产业部门邮箱）：可以复制邮箱地址，也可以联系人工客服。', run: async () => { await guidanceFor('bj-edz-jbgsh-2026'); await focus('[data-action="copy-official"], [data-action="guidance-service"], .guidance-detail'); } },
    { n: 18, stage: '办理', title: '离开本产品', how: '在办理指引里点官方系统、政策原文或申报模板，每次都先弹窗确认。', run: async () => { await guidanceFor('zz-self-rd-2026'); await focus('.guidance-detail, .guidance-step'); } },
    { n: 19, stage: '办理', title: '未选政策就进入办理指引', how: '久其金建还没选政策就打开办理指引，给通用流程和“先选政策”入口。', run: async () => { const task = S().createTask({ title: `${JINJIAN} · 政策申报`, request: '查看办理指引。', company: { name: JINJIAN, ...M().apiProfile(JINJIAN) }, intake: { stage: 'ready', answers: {}, files: [] } }); location.hash = `#task?task=${encodeURIComponent(task.id)}&work=guidance`; await sleep(1200); } },
    { n: 20, sub: '读不出文字', stage: '申报', title: '文件读不出文字', how: '进入揭榜挂帅项目的材料整理，上传一张图片或扫描版 PDF，会如实提示读不出。', run: async () => { const id = await mk(JINJIAN, FULL); await choosePolicy('bj-edz-jbgsh-2026'); location.hash = `#task?task=${encodeURIComponent(id)}&work=assembly`; await focus('[data-source-upload]'); } },
    { n: 20, sub: '上传失败', stage: '申报', title: '文件上传失败', how: '真实上传故障无法复现，用模拟开关。进入材料整理后上传任意文件，提示重试。', sims: ['uploadFail'], run: async () => { const id = await mk(JINJIAN, FULL); await choosePolicy('bj-edz-jbgsh-2026'); location.hash = `#task?task=${encodeURIComponent(id)}&work=assembly`; await focus('[data-source-upload]'); } },
    { n: 21, stage: '解读', title: '白话解读生成失败', how: '模型故障无法复现，用模拟开关。隐藏白话摘要模块，其余要素照常显示。', sims: ['interpretFail'], run: async () => { await mk(JINJIAN, FULL); await openPolicy('bj-edz-jbgsh-2026'); await focus('#match-drawer .interpret-summary'); } },
    { n: 22, stage: '账号', title: '未登录', how: '用模拟开关。先登录，登录后回到原页面。', sims: ['loggedOut'], run: async () => { location.hash = '#dashboard?work=interpret'; window.PolicyUI.refresh(); } },
    { n: 23, stage: '材料库', title: '没有材料版本', how: '上海久其软件有限公司还没有确认过材料版本，引导去整理申报材料。', run: async () => { location.hash = `#library?company=${encodeURIComponent('上海久其软件有限公司')}`; } },
    { n: 24, sub: '文本', stage: '内容安全', title: '对话内容未通过审核', how: '内容审核结果无法用真实数据复现，用模拟开关。进入揭榜挂帅项目的申报辅助对话，发送任意一句话，消息会被拦截并提示修改后重发。', sims: ['textBlocked'], run: async () => { const id = await mk(JINJIAN, FULL); await choosePolicy('bj-edz-jbgsh-2026'); location.hash = `#task?task=${encodeURIComponent(id)}&work=assembly`; await focus('#adviser-message'); } },
    { n: 24, sub: '文件/图片', stage: '内容安全', title: '上传内容未通过审核', how: '内容审核结果无法用真实数据复现，用模拟开关。进入揭榜挂帅项目的材料整理，上传任意文件或图片，显示“未通过审核”，不解析。', sims: ['fileBlocked'], run: async () => { const id = await mk(JINJIAN, FULL); await choosePolicy('bj-edz-jbgsh-2026'); location.hash = `#task?task=${encodeURIComponent(id)}&work=assembly`; await focus('[data-source-upload]'); } },
  ];

  function render() {
    const Sim = window.PolicySim;
    const toggles = Object.entries(Sim.LABELS).map(([key, label]) => `<label class="scenario-toggle"><input type="checkbox" data-sim="${key}"${Sim.on(key) ? ' checked' : ''}><span>${E(label)}</span></label>`).join('');
    const rows = items.map((item, index) => `<li class="scenario-row"><span class="scenario-no">${item.n}</span><div class="scenario-main"><p class="scenario-stage">${E(item.stage)}${item.sims ? '<em class="scenario-sim">模拟开关</em>' : ''}</p><h3>${E(item.title)}</h3><p>${E(item.how)}</p></div><button type="button" class="button button-secondary" data-action="scenario-run" data-index="${index}">进入</button></li>`).join('');
    return `<div class="scenario-page"><header class="scenario-head"><p class="scenario-demo-tag">演示用，正式版不含此页</p><h1>异常场景</h1><p>主流程之外的 24 种情况，点“进入”直接查看。企业和政策都是真实的；真实数据触发不了的系统故障用模拟开关。</p></header><section class="scenario-sims" aria-labelledby="sim-title"><h2 id="sim-title">模拟开关</h2><p>打开后对所有页面生效，用完记得关掉。进入带“模拟开关”标记的场景时会自动打开对应开关。</p><div class="scenario-toggles">${toggles}</div></section><ol class="scenario-list">${rows}</ol></div>`;
  }

  document.addEventListener('change', event => {
    const box = event.target instanceof Element ? event.target.closest('[data-sim]') : null;
    if (!box) return;
    window.PolicySim.set(box.dataset.sim, box.checked);
    window.PolicyUI.toast(`${window.PolicySim.LABELS[box.dataset.sim]}：${box.checked ? '已打开' : '已关闭'}`);
  });
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action="scenario-run"], [data-action="sim-login"]') : null;
    if (!target) return;
    if (target.dataset.action === 'sim-login') { window.PolicySim.set('loggedOut', false); window.PolicyUI.refresh(); window.PolicyUI.toast('已登录。'); return; }
    const item = items[Number(target.dataset.index)];
    if (!item) return;
    window.PolicySim.reset();
    (item.sims || []).forEach(key => window.PolicySim.set(key, true));
    target.disabled = true;
    try { await item.run(); } catch (error) { console.error('进入异常场景失败', error); window.PolicyUI.toast('没能进入这个场景，请重试。'); }
    finally { target.disabled = false; }
  });

  window.PolicyScenarios = Object.freeze({ render, items });
})();
