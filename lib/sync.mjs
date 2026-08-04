import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const positivePattern = /(2026|2027).{0,20}(公开招聘|招聘公告|招聘启事|人才招聘|招聘工作人员|招聘教师)|(?:公开招聘|招聘公告|招聘启事|人才招聘|招聘工作人员|招聘教师).{0,20}(2026|2027)/i;
const negativePattern = /(成绩|名单|公示|资格|考试安排|体检|面试|笔试|递补|录用|聘用|评审|审核|通知|博士后)/;
const strongMatchPattern = /(国际中文教育|汉语国际教育|对外汉语|中国语言文学|语言学及应用语言学|学科教学.?语文|语文教师|中文教师)/;

function decodeHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '\"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const title = decodeHtml(match[2]);
    if (!title || !positivePattern.test(title) || negativePattern.test(title)) continue;
    try {
      const url = new URL(match[1], baseUrl).href;
      if (url.startsWith("http")) links.push({ title, url });
    } catch {}
  }
  return [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 12);
}

function buildId(url) { return createHash("sha1").update(url).digest("hex").slice(0, 12); }
function classifyMatch(title) {
  if (strongMatchPattern.test(title)) return "明确匹配";
  if (/辅导员|行政|综合管理|教务|学生工作/.test(title)) return "可能匹配";
  return "待核实";
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 GuangdongTeacherRadar/0.1", Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}

export async function syncJobs(rootDir) {
  const jobsPath = join(rootDir, "data", "jobs.json");
  const sourcesPath = join(rootDir, "data", "sources.json");
  const jobs = JSON.parse(await readFile(jobsPath, "utf8"));
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  const knownUrls = new Set(jobs.flatMap((job) => [job.officialUrl, ...(job.relatedUrls || [])]));
  const checkedAt = new Date().toISOString();
  let discovered = 0;

  for (const source of sources) {
    try {
      const links = extractLinks(await fetchPage(source.url), source.url);
      source.lastChecked = checkedAt;
      source.health = "正常";
      source.message = `发现 ${links.length} 个招聘公告链接`;
      for (const link of links) {
        if (knownUrls.has(link.url)) continue;
        knownUrls.add(link.url);
        jobs.unshift({
          id: `auto-${buildId(link.url)}`, school: source.school, schoolLevel: source.schoolLevel, city: source.city, ownership: source.ownership,
          establishment: "待核实", position: link.title, majorMatch: classifyMatch(link.title), matchReason: "系统从学校官网发现的新公告，岗位表尚待人工核验。",
          eligible2027: "待核实", applicationPeriod: "待核实", examDate: "待核实", examFormat: "待核实", headcount: "待核实", salary: "以正式公告为准",
          status: "待核实", publishedAt: "待核实", updatedAt: checkedAt, officialUrl: link.url, verified: false,
          notes: "自动发现记录。请打开官网公告和岗位表，核对专业代码、毕业时间、政治面貌及资格证要求。"
        });
        discovered += 1;
      }
    } catch (error) {
      source.lastChecked = checkedAt;
      source.health = "异常";
      source.message = error.name === "AbortError" ? "访问超时" : error.message;
    }
  }

  await Promise.all([writeFile(jobsPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8"), writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8")]);
  return { message: `更新完成，新发现 ${discovered} 条公告。`, discovered, checkedAt };
}
