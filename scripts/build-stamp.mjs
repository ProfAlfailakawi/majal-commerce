/*
 * بصمة البناء (build stamp).
 *
 * كل عملية بناء تُولّد معرّفًا فريدًا: طابع زمني + هاش قصير. هذا المعرّف:
 *   1) يُحقن في حزمة الواجهة كثابت `__BUILD_ID__`،
 *   2) يُكتب في `dist/build-id.json` ليقرأه الخادم ويعرضه على `GET /api/version`،
 *   3) يُطبع داخل `sw.js` المنسوخ إلى dist — وهذا شرط لازم: لو لم تتغيّر بايتات عامل
 *      الخدمة مع كل إصدار، فلن يرى المتصفح تحديثًا أصلًا ولن تعلم التبويبات المفتوحة بشيء.
 *
 * المقارنة بين ثابت الحزمة وردّ `/api/version` هي الحقيقة الوحيدة التي يُبنى عليها التحديث.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** طابع زمني بالأساس 36 + ثمانية أحرف من الهاش (أو من رقم الالتزام إن وفّرته بيئة النشر). */
export function makeBuildId() {
  const time = Date.now().toString(36);
  const sha = (
    process.env.BUILD_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.SHORT_SHA ||
    randomBytes(6).toString('hex')
  )
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 8)
    .toLowerCase();
  return `${time}-${sha}`;
}

/**
 * @param {{ buildId?: string, serviceWorkers?: string[] }} [options]
 *   serviceWorkers: أسماء ملفات العامل داخل dist التي يجب أن تحمل البصمة (افتراضيًا sw.js).
 */
export function buildStamp(options = {}) {
  const buildId = options.buildId || makeBuildId();
  const workers = options.serviceWorkers || ['sw.js'];
  let outDir = 'dist';
  let isBuild = false;

  return {
    name: 'app-build-stamp',
    config() {
      return { define: { __BUILD_ID__: JSON.stringify(buildId) } };
    },
    configResolved(resolved) {
      outDir = resolved.build?.outDir || 'dist';
      isBuild = resolved.command === 'build';
    },
    closeBundle() {
      if (!isBuild) return;
      const root = process.cwd();
      const dist = join(root, outDir);
      try {
        mkdirSync(dist, { recursive: true });
        writeFileSync(
          join(dist, 'build-id.json'),
          `${JSON.stringify({ build: buildId, builtAt: new Date().toISOString() }, null, 2)}\n`,
        );
      } catch { /* البناء لا يفشل بسبب بصمة؛ الخادم يسقط إلى 'dev' */ }

      // بايتات عامل الخدمة يجب أن تختلف مع كل إصدار، وإلا لم يرَ المتصفح تحديثًا.
      for (const name of workers) {
        const file = join(dist, name);
        if (!existsSync(file)) continue;
        try {
          const src = readFileSync(file, 'utf8');
          if (!src.includes('__BUILD_ID__')) continue;
          writeFileSync(file, src.split('__BUILD_ID__').join(buildId));
        } catch { /* تجاهُل: نسخة العامل تبقى كما هي */ }
      }
    },
  };
}

export default buildStamp;
