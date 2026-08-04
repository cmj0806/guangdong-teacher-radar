const state = {
  jobs: [],
  sources: [],
  profile: { preferredCities: [], targetLevels: [] },
  favorites: new Set(JSON.parse(localStorage.getItem("teacherRadarFavorites") || "[]"))
};
const elements = {
  jobsBody: document.querySelector("#jobsBody"), emptyState: document.querySelector("#emptyState"), sourceGrid: document.querySelector("#sourceGrid"), resultSummary: document.querySelector("#resultSummary"), syncButton: document.querySelector("#syncButton"), syncMessage: document.querySelector("#syncMessage"), exportButton: document.querySelector("#exportButton"), searchInput: document.querySelector("#searchInput"), ownershipFilter: document.querySelector("#ownershipFilter"), establishmentFilter: document.querySelector("#establishmentFilter"), matchFilter: document.querySelector("#matchFilter"), statusFilter: document.querySelector("#statusFilter"), cityFilter: document.querySelector("#cityFilter"), collegeOnlyFilter: document.querySelector("#collegeOnlyFilter"), detailDialog: document.querySelector("#detailDialog"), dialogContent: document.querySelector("#dialogContent")
};
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function formatDateTime(value) { if (!value) return "尚未检查"; return new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(new Date(value)); }
function tagClass(value) { return ({ 公办:"tag-public", 民办:"tag-private", 事业编制:"tag-establishment", 非编制:"tag-non", 进行中:"tag-open", 已截止:"tag-closed", 明确匹配:"tag-match", 可能匹配:"tag-possible", 专业不限:"tag-any", 待核实:"tag-pending", 适配较高:"tag-match", 值得关注:"tag-public", 条件不符:"tag-closed", 城市非首选:"tag-non" })[value] || "tag-pending"; }
function assessProfile(job) {
  const requirements = job.requirements || {};
  const profile = state.profile;
  if (requirements.requiresParty === true && !profile.partyRequirementMet) return { level:"条件不符", reason:"岗位要求中共党员或预备党员，当前默认条件不满足。" };
  if (requirements.requiresStudentCadre === true && !profile.studentCadreRequirementMet) return { level:"条件不符", reason:"岗位要求学生干部经历，当前不满足。" };
  const missingCertificates = (requirements.requiredCertificates || []).filter((certificate) => !(profile.certificates || []).includes(certificate));
  if (missingCertificates.length) return { level:"条件不符", reason:`尚缺少：${missingCertificates.join("、")}。` };
  const preferredCity = (profile.preferredCities || []).includes(job.city);
  const targetSchool = job.ownership === profile.targetOwnership && (profile.targetLevels || []).includes(job.schoolLevel);
  const majorStrong = ["明确匹配", "专业不限"].includes(job.majorMatch);
  if (preferredCity && targetSchool && majorStrong) return { level:"适配较高", reason:"城市、学校性质和专业条件与当前画像较吻合，仍需核对毕业时间和岗位表。" };
  if (preferredCity && targetSchool && job.majorMatch === "可能匹配") return { level:"值得关注", reason:"城市和学校类型符合目标，专业代码需要进一步核验。" };
  if (!preferredCity) return { level:"城市非首选", reason:"岗位不在当前设定的珠三角优先城市范围内。" };
  return { level:"待核实", reason:"暂未发现明确冲突，但岗位专业或资格条件仍不完整。" };
}
function getFilteredJobs() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const ownership = elements.ownershipFilter.value, establishment = elements.establishmentFilter.value, match = elements.matchFilter.value, status = elements.statusFilter.value, city = elements.cityFilter.value, collegeOnly = elements.collegeOnlyFilter.checked;
  return state.jobs.filter((job) => {
    const haystack = [job.school,job.city,job.position,job.majorMatch,job.matchReason].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && (ownership === "all" || job.ownership === ownership) && (establishment === "all" || job.establishment === establishment) && (match === "all" || job.majorMatch === match) && (status === "all" || job.status === status) && (city === "all" || state.profile.preferredCities.includes(job.city)) && (!collegeOnly || ["高职院校","职业本科"].includes(job.schoolLevel));
  }).sort((left,right) => {
    const favoriteDifference = Number(state.favorites.has(right.id)) - Number(state.favorites.has(left.id));
    if (favoriteDifference) return favoriteDifference;
    const fitOrder = { 适配较高:0, 值得关注:1, 待核实:2, 城市非首选:3, 条件不符:4 };
    const fitDifference = (fitOrder[assessProfile(left).level] ?? 5) - (fitOrder[assessProfile(right).level] ?? 5);
    if (fitDifference) return fitDifference;
    const statusOrder = { 进行中:0, 待核实:1, 已截止:2 };
    return (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3) || String(right.publishedAt).localeCompare(String(left.publishedAt));
  });
}
function renderStats() {
  document.querySelector("#openCount").textContent = state.jobs.filter((job) => job.status === "进行中").length;
  document.querySelector("#establishmentCount").textContent = state.jobs.filter((job) => job.establishment === "事业编制").length;
  document.querySelector("#matchCount").textContent = state.jobs.filter((job) => assessProfile(job).level === "适配较高").length;
  document.querySelector("#sourceCount").textContent = state.sources.length;
}
function renderJobs() {
  const jobs = getFilteredJobs();
  elements.resultSummary.textContent = `显示 ${jobs.length} 条，共收录 ${state.jobs.length} 条；已按默认城市和资格条件排序。`;
  elements.emptyState.hidden = jobs.length !== 0;
  elements.jobsBody.innerHTML = jobs.map((job) => {
    const fit = assessProfile(job);
    return `<tr>
      <td><button class="favorite-button ${state.favorites.has(job.id) ? "active" : ""}" type="button" data-favorite="${escapeHtml(job.id)}" aria-label="收藏 ${escapeHtml(job.school)}">${state.favorites.has(job.id) ? "★" : "☆"}</button></td>
      <td class="school-cell"><span class="school-name">${escapeHtml(job.school)}</span><span class="school-meta">${escapeHtml(job.city)} · ${escapeHtml(job.schoolLevel)}</span></td>
      <td><span class="tag ${tagClass(job.ownership)}">${escapeHtml(job.ownership)}</span></td>
      <td><span class="tag ${tagClass(job.establishment)}">${escapeHtml(job.establishment)}</span></td>
      <td class="position-cell"><strong>${escapeHtml(job.position)}</strong><span class="match-line"><span class="tag ${tagClass(job.majorMatch)}">${escapeHtml(job.majorMatch)}</span><span class="tag ${tagClass(fit.level)}">画像：${escapeHtml(fit.level)}</span></span><span class="cell-note">当前批次2027届：${escapeHtml(job.eligible2027)}</span><button class="details-button" type="button" data-detail="${escapeHtml(job.id)}">查看判断依据</button></td>
      <td class="time-cell"><strong>${escapeHtml(job.applicationPeriod)}</strong><span class="cell-note">考试：${escapeHtml(job.examDate)}</span></td>
      <td class="exam-cell">${escapeHtml(job.examFormat)}</td><td>${escapeHtml(job.headcount)}</td><td class="salary-cell">${escapeHtml(job.salary)}</td>
      <td><span class="tag ${tagClass(job.status)}">${escapeHtml(job.status)}</span><span class="cell-note">${job.verified ? "已核验" : "自动发现"}</span></td>
      <td><a class="official-link" href="${escapeHtml(job.officialUrl)}" target="_blank" rel="noopener noreferrer">打开官网 ↗</a></td>
    </tr>`;
  }).join("");
}
function renderSources() { elements.sourceGrid.innerHTML = state.sources.map((source) => `<article class="source-card"><div class="source-top"><h3>${escapeHtml(source.school)}</h3><span class="health ${source.health === "正常" ? "" : "error"}">${escapeHtml(source.health)}</span></div><p>${escapeHtml(source.message)}<br />检查：${escapeHtml(formatDateTime(source.lastChecked))}</p><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">查看招聘栏目 ↗</a></article>`).join(""); }
function renderAll(){ renderStats(); renderJobs(); renderSources(); }
async function loadData(){ const [jobsResponse,sourcesResponse,profileResponse]=await Promise.all([fetch("./data/jobs.json",{cache:"no-store"}),fetch("./data/sources.json",{cache:"no-store"}),fetch("./data/profile.json",{cache:"no-store"})]); if(!jobsResponse.ok||!sourcesResponse.ok||!profileResponse.ok) throw new Error("无法读取招聘数据"); state.jobs=await jobsResponse.json(); state.sources=await sourcesResponse.json(); state.profile=await profileResponse.json(); renderAll(); }
function toggleFavorite(id){ if(state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id); localStorage.setItem("teacherRadarFavorites",JSON.stringify([...state.favorites])); renderJobs(); }
function openDetails(id){ const job=state.jobs.find((item)=>item.id===id); if(!job) return; const fit=assessProfile(job); elements.dialogContent.innerHTML=`<div class="dialog-body"><p class="dialog-school">${escapeHtml(job.school)} · ${escapeHtml(job.city)}</p><h3>${escapeHtml(job.position)}</h3><div class="dialog-grid"><div class="dialog-item"><span>学校性质 / 编制</span><strong>${escapeHtml(job.ownership)} · ${escapeHtml(job.establishment)}</strong></div><div class="dialog-item"><span>个人条件适配</span><strong>${escapeHtml(fit.level)}</strong></div><div class="dialog-item"><span>专业匹配判断</span><strong>${escapeHtml(job.majorMatch)}</strong></div><div class="dialog-item"><span>当前批次2027届能否报考</span><strong>${escapeHtml(job.eligible2027)}</strong></div><div class="dialog-item"><span>报名时间</span><strong>${escapeHtml(job.applicationPeriod)}</strong></div><div class="dialog-item"><span>考试形式</span><strong>${escapeHtml(job.examFormat)}</strong></div></div><p class="dialog-note"><strong>个人条件判断：</strong>${escapeHtml(fit.reason)}<br /><br /><strong>专业判断：</strong>${escapeHtml(job.matchReason)}<br /><br />${escapeHtml(job.notes)}</p><a class="dialog-link" href="${escapeHtml(job.officialUrl)}" target="_blank" rel="noopener noreferrer">打开学校官网公告</a></div>`; elements.detailDialog.showModal(); }
function exportCsv(){ const rows=getFilteredJobs(); const headers=["学校","城市","公办/民办","是否编制","可报岗位","专业匹配","个人条件适配","当前批次2027届可报","报名时间","考试时间","考试形式","招聘人数","工资情况","状态","官网"]; const values=rows.map((job)=>[job.school,job.city,job.ownership,job.establishment,job.position,job.majorMatch,assessProfile(job).level,job.eligible2027,job.applicationPeriod,job.examDate,job.examFormat,job.headcount,job.salary,job.status,job.officialUrl]); const csv=[headers,...values].map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n"); const blob=new Blob([`\ufeff${csv}`],{type:"text/csv;charset=utf-8"}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`广东高校招聘雷达-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href); }
async function syncData(){ if(!["localhost","127.0.0.1"].includes(location.hostname)){ elements.syncMessage.textContent="在线版每6小时自动检查一次官网；正在刷新最新已发布数据。"; await loadData(); return; } elements.syncButton.disabled=true; elements.syncButton.classList.add("is-spinning"); elements.syncMessage.textContent="正在逐个检查学校官网，请稍候…"; try{ const response=await fetch("/api/sync",{method:"POST"}); const payload=await response.json(); if(!response.ok) throw new Error(payload.message||"更新失败"); elements.syncMessage.textContent=`${payload.message} 检查时间：${formatDateTime(payload.checkedAt)}`; await loadData(); } catch(error){ elements.syncMessage.textContent=`更新未完成：${error.message}`; } finally{ elements.syncButton.disabled=false; elements.syncButton.classList.remove("is-spinning"); } }
document.querySelector("#todayText").textContent=new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date());
[elements.searchInput,elements.ownershipFilter,elements.establishmentFilter,elements.matchFilter,elements.statusFilter,elements.cityFilter,elements.collegeOnlyFilter].forEach((element)=>element.addEventListener("input",renderJobs));
elements.jobsBody.addEventListener("click",(event)=>{ const favoriteButton=event.target.closest("[data-favorite]"); const detailButton=event.target.closest("[data-detail]"); if(favoriteButton) toggleFavorite(favoriteButton.dataset.favorite); if(detailButton) openDetails(detailButton.dataset.detail); });
elements.syncButton.addEventListener("click",syncData); elements.exportButton.addEventListener("click",exportCsv); document.querySelector("#dialogClose").addEventListener("click",()=>elements.detailDialog.close()); elements.detailDialog.addEventListener("click",(event)=>{if(event.target===elements.detailDialog) elements.detailDialog.close();});
loadData().catch((error)=>{ elements.syncMessage.textContent=`${error.message}。请使用 npm start 启动网站。`; });
