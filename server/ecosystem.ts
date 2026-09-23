import { createHash, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { catchAsyncErrors } from './async-router';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import { MajalDatabase, withTransaction } from './database';

const now = () => new Date().toISOString();
const text = (value: unknown, min = 1, max = 500) => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned.length >= min && cleaned.length <= max ? cleaned : undefined;
};
const integer = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+$/.test(value.trim()))) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
};
const optionalInteger = (value: unknown, min: number, max: number): { value: number | null; valid: boolean } => {
  if (value === '' || value === null || value === undefined) return { value: null, valid: true };
  const parsed = integer(value, min, max);
  return parsed === undefined ? { value: null, valid: false } : { value: parsed, valid: true };
};
const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
const isAdmin = (req: AuthenticatedRequest) => ['ADMIN', 'SUPER_ADMIN'].includes(req.auth?.user.role || '');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

async function audit(db: MajalDatabase, req: AuthenticatedRequest, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, organizationId?: string | null) {
  const auth = req.auth!;
  await db.prepare(`INSERT INTO domain_audit_events(
    actor_user_id,actor_role,organization_id,action,entity_type,entity_id,before_sha256,after_sha256,request_id,session_hash,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    auth.user.id,
    auth.user.role,
    organizationId ?? auth.user.hostBusinessId ?? null,
    action,
    entityType,
    entityId,
    before === undefined ? null : hash(before),
    after === undefined ? null : hash(after),
    text(req.header('x-request-id'), 8, 128) || randomUUID(),
    hash(auth.tokenHash),
    now()
  );
}

type SupplierRow = {
  id: string;
  user_id: string;
  commercial_name: string;
  category: string;
  verification_status: string;
  commercial_registration_no: string;
  description: string;
  region: string;
  contact_phone: string;
  contact_email: string;
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type OfferingRow = {
  id: string;
  supplier_id: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  min_order_qty: number | string;
  lead_time_days: number | string;
  price_from_fils: number | string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type JobApplicationRow = {
  id: string;
  job_post_id: string;
  applicant_user_id: string;
  full_name: string;
  email: string;
  phone: string;
  summary: string;
  years_experience: number | string;
  kuwaiti_declaration: number | string;
  status: string;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  employer_type: 'HOST' | 'SUPPLIER';
  employer_id: string;
  created_by_user_id: string;
  employer_name: string;
  title: string;
  department: string;
  employment_type: string;
  location: string;
  description: string;
  requirements_json: string;
  salary_min_fils: number | string | null;
  salary_max_fils: number | string | null;
  kuwaiti_only: number | string;
  status: string;
  admin_note: string;
  reviewed_at: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

const supplierPublic = (row: SupplierRow) => ({
  id: row.id,
  commercialName: row.commercial_name,
  category: row.category,
  verificationStatus: row.verification_status,
  description: row.description,
  region: row.region,
  createdAt: row.created_at
});
const supplierOwner = (row: SupplierRow) => ({
  ...supplierPublic(row),
  commercialRegistrationNo: row.commercial_registration_no,
  contactPhone: row.contact_phone,
  contactEmail: row.contact_email,
  adminNote: row.admin_note,
  reviewedAt: row.reviewed_at,
  updatedAt: row.updated_at
});
const offeringPublic = (row: OfferingRow) => ({
  id: row.id,
  supplierId: row.supplier_id,
  name: row.name,
  category: row.category,
  description: row.description,
  unit: row.unit,
  minOrderQty: Number(row.min_order_qty),
  leadTimeDays: Number(row.lead_time_days),
  priceFromFils: row.price_from_fils === null ? null : Number(row.price_from_fils),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
const safeRequirements = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 20) : [];
  } catch { return []; }
};
const applicationOwner = (row: JobApplicationRow) => ({
  id: row.id,
  jobId: row.job_post_id,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  summary: row.summary,
  yearsExperience: Number(row.years_experience),
  kuwaitiDeclaration: Number(row.kuwaiti_declaration) === 1,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
const jobPublic = (row: JobRow) => ({
  id: row.id,
  employerType: row.employer_type,
  employerId: row.employer_id,
  employerName: row.employer_name,
  title: row.title,
  department: row.department,
  employmentType: row.employment_type,
  location: row.location,
  description: row.description,
  requirements: safeRequirements(row.requirements_json),
  salaryMinFils: row.salary_min_fils === null ? null : Number(row.salary_min_fils),
  salaryMaxFils: row.salary_max_fils === null ? null : Number(row.salary_max_fils),
  kuwaitiOnly: Number(row.kuwaiti_only) === 1,
  status: row.status,
  submittedAt: row.submitted_at,
  createdAt: row.created_at,
  ...(row.status !== 'APPROVED' ? { adminNote: row.admin_note, reviewedAt: row.reviewed_at } : {})
});

async function ownedSupplier(db: MajalDatabase, req: AuthenticatedRequest) {
  const supplierId = req.auth?.user.supplierId;
  if (!supplierId || req.auth?.user.accountType !== 'SUPPLIER') return undefined;
  return db.prepare('SELECT * FROM supplier_profiles WHERE id=? AND user_id=? LIMIT 1').get<SupplierRow>(supplierId, req.auth.user.id);
}

async function employerContext(db: MajalDatabase, req: AuthenticatedRequest) {
  const supplier = await ownedSupplier(db, req);
  if (supplier) return { type: 'SUPPLIER' as const, id: supplier.id, name: supplier.commercial_name };
  if (req.auth?.user.hostBusinessId && ['HOST_OWNER', 'HOST_OPERATIONS'].includes(req.auth.user.role)) {
    const org = await db.prepare('SELECT commercial_name FROM organizations WHERE id=? LIMIT 1').get<{commercial_name:string}>(req.auth.user.hostBusinessId);
    if (org) return { type: 'HOST' as const, id: req.auth.user.hostBusinessId, name: org.commercial_name };
  }
  return undefined;
}

export function createEcosystemRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = catchAsyncErrors(Router());

  // Public discovery exposes only approved/verified records. No tenant owner ids, contacts,
  // registry numbers, applications, or admin notes are sent to anonymous callers.
  router.get('/public', async (_req, res) => {
    const suppliers = await db.prepare("SELECT * FROM supplier_profiles WHERE verification_status='VERIFIED' ORDER BY updated_at DESC LIMIT 120").all<SupplierRow>();
    const supplierIds = suppliers.map(row => row.id);
    const offerings = supplierIds.length
      ? await db.prepare(`SELECT so.* FROM supplier_offerings so JOIN supplier_profiles sp ON sp.id=so.supplier_id
          WHERE sp.verification_status='VERIFIED' AND so.status='ACTIVE' ORDER BY so.updated_at DESC LIMIT 300`).all<OfferingRow>()
      : [];
    const jobs = await db.prepare("SELECT * FROM job_posts WHERE status='APPROVED' ORDER BY submitted_at DESC LIMIT 120").all<JobRow>();
    res.json({ suppliers: suppliers.map(supplierPublic), offerings: offerings.map(offeringPublic), jobs: jobs.map(jobPublic) });
  });

  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);
  router.use(authenticated);

  router.get('/me', async (req: AuthenticatedRequest, res) => {
    const supplier = await ownedSupplier(db, req);
    const employer = await employerContext(db, req);
    const offerings = supplier
      ? await db.prepare('SELECT * FROM supplier_offerings WHERE supplier_id=? ORDER BY created_at DESC LIMIT 200').all<OfferingRow>(supplier.id)
      : [];
    const jobs = employer
      ? await db.prepare('SELECT * FROM job_posts WHERE employer_type=? AND employer_id=? ORDER BY submitted_at DESC LIMIT 200').all<JobRow>(employer.type, employer.id)
      : [];
    res.json({ supplier: supplier ? supplierOwner(supplier) : null, offerings: offerings.map(offeringPublic), jobs: jobs.map(jobPublic) });
  });

  router.post('/supplier/submit-verification', csrfProtected, async (req: AuthenticatedRequest, res) => {
    const supplier = await ownedSupplier(db, req);
    if (!supplier) return jsonError(res, 403, 'هذه الخدمة متاحة لحساب المورد المالك فقط.', 'SUPPLIER_REQUIRED');
    if (supplier.verification_status === 'VERIFIED') return res.json({ supplier: supplierOwner(supplier) });
    const registration = text(req.body?.commercialRegistrationNo ?? supplier.commercial_registration_no, 3, 80);
    if (!registration) return jsonError(res, 400, 'أدخل رقم السجل التجاري قبل إرسال طلب التحقق.', 'REGISTRATION_REQUIRED');
    const updatedAt = now();
    await db.prepare("UPDATE supplier_profiles SET commercial_registration_no=?,verification_status='PENDING',admin_note='',updated_at=? WHERE id=?")
      .run(registration, updatedAt, supplier.id);
    await audit(db, req, 'SUPPLIER_VERIFICATION_SUBMITTED', 'SUPPLIER', supplier.id, supplier, { verificationStatus: 'PENDING' });
    const updated = await db.prepare('SELECT * FROM supplier_profiles WHERE id=?').get<SupplierRow>(supplier.id);
    res.json({ supplier: supplierOwner(updated!) });
  });

  router.post('/offerings', csrfProtected, async (req: AuthenticatedRequest, res) => {
    const supplier = await ownedSupplier(db, req);
    if (!supplier) return jsonError(res, 403, 'إدارة التوريد متاحة لحساب المورد المالك فقط.', 'SUPPLIER_REQUIRED');
    const name = text(req.body?.name, 2, 160), category = text(req.body?.category, 2, 120);
    const description = text(req.body?.description, 0, 1200) ?? '';
    const unit = text(req.body?.unit, 1, 80) ?? '';
    const minOrderQty = integer(req.body?.minOrderQty ?? 1, 1, 1_000_000);
    const leadTimeDays = integer(req.body?.leadTimeDays ?? 0, 0, 3650);
    const priceFromFils = req.body?.priceFromFils === '' || req.body?.priceFromFils === null || req.body?.priceFromFils === undefined
      ? null : integer(req.body.priceFromFils, 0, 1_000_000_000);
    if (!name || !category || minOrderQty === undefined || leadTimeDays === undefined || (req.body?.priceFromFils !== undefined && req.body?.priceFromFils !== '' && priceFromFils === undefined)) {
      return jsonError(res, 400, 'بيانات التوريد غير صالحة.', 'INVALID_OFFERING');
    }
    const id = `off_${randomUUID()}`, createdAt = now();
    await db.prepare(`INSERT INTO supplier_offerings(id,supplier_id,name,category,description,unit,min_order_qty,lead_time_days,price_from_fils,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE',?,?)`).run(id,supplier.id,name,category,description,unit,minOrderQty,leadTimeDays,priceFromFils,createdAt,createdAt);
    const row = await db.prepare('SELECT * FROM supplier_offerings WHERE id=?').get<OfferingRow>(id);
    await audit(db, req, 'SUPPLIER_OFFERING_CREATED', 'SUPPLIER_OFFERING', id, undefined, row);
    res.status(201).json({ offering: offeringPublic(row!) });
  });

  router.post('/jobs', csrfProtected, async (req: AuthenticatedRequest, res) => {
    const employer = await employerContext(db, req);
    if (!employer) return jsonError(res, 403, 'نشر الوظائف متاح لمالك/تشغيل المنشأة أو المورد المالك فقط.', 'EMPLOYER_REQUIRED');
    const title = text(req.body?.title, 2, 160), department = text(req.body?.department, 0, 120) ?? '';
    const employmentType = text(req.body?.employmentType, 4, 20);
    const location = text(req.body?.location, 2, 160) ?? 'الكويت';
    const description = text(req.body?.description, 20, 4000);
    const requirements = Array.isArray(req.body?.requirements)
      ? req.body.requirements.map((item: unknown) => text(item, 1, 240)).filter(Boolean).slice(0, 20)
      : [];
    const salaryMin = optionalInteger(req.body?.salaryMinFils, 0, 100_000_000);
    const salaryMax = optionalInteger(req.body?.salaryMaxFils, 0, 100_000_000);
    if (!title || !description || !employmentType || !['FULL_TIME','PART_TIME','CONTRACT','INTERNSHIP'].includes(employmentType)) return jsonError(res, 400, 'بيانات الوظيفة غير مكتملة.', 'INVALID_JOB');
    if (!salaryMin.valid || !salaryMax.valid) return jsonError(res, 400, 'قيمة الراتب غير صالحة.', 'INVALID_SALARY');
    const salaryMinFils = salaryMin.value, salaryMaxFils = salaryMax.value;
    if (salaryMinFils !== null && salaryMaxFils !== null && salaryMaxFils < salaryMinFils) return jsonError(res, 400, 'الحد الأعلى للراتب يجب ألا يقل عن الحد الأدنى.', 'INVALID_SALARY_RANGE');

    const id = `job_${randomUUID()}`, createdAt = now();
    await db.prepare(`INSERT INTO job_posts(
      id,employer_type,employer_id,created_by_user_id,employer_name,title,department,employment_type,location,description,
      requirements_json,salary_min_fils,salary_max_fils,kuwaiti_only,status,submitted_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,'PENDING_REVIEW',?,?,?)`).run(
      id,employer.type,employer.id,req.auth!.user.id,employer.name,title,department,employmentType,location,description,
      JSON.stringify(requirements),salaryMinFils,salaryMaxFils,createdAt,createdAt,createdAt
    );
    const row = await db.prepare('SELECT * FROM job_posts WHERE id=?').get<JobRow>(id);
    await audit(db, req, 'KUWAIT_JOB_SUBMITTED', 'JOB_POST', id, undefined, row, employer.type === 'HOST' ? employer.id : null);
    res.status(201).json({ job: jobPublic(row!), message: 'أُرسل الإعلان للإدارة. لن يظهر للباحثين عن عمل قبل الموافقة.' });
  });

  router.post('/jobs/:id/close', csrfProtected, async (req: AuthenticatedRequest, res) => {
    const employer = await employerContext(db, req);
    if (!employer) return jsonError(res, 403, 'لا تملك جهة توظيف مرتبطة بهذا الحساب.', 'EMPLOYER_REQUIRED');
    const row = await db.prepare('SELECT * FROM job_posts WHERE id=? LIMIT 1').get<JobRow>(req.params.id);
    if (!row) return jsonError(res, 404, 'الإعلان غير موجود.', 'NOT_FOUND');
    if (row.employer_type !== employer.type || row.employer_id !== employer.id) return jsonError(res, 403, 'لا تملك هذا الإعلان.', 'FORBIDDEN');
    await db.prepare("UPDATE job_posts SET status='CLOSED',updated_at=? WHERE id=?").run(now(), row.id);
    await audit(db, req, 'KUWAIT_JOB_CLOSED', 'JOB_POST', row.id, row, { status: 'CLOSED' }, employer.type === 'HOST' ? employer.id : null);
    res.json({ id: row.id, status: 'CLOSED' });
  });

  router.get('/jobs/:id/applications', async (req: AuthenticatedRequest, res) => {
    const employer = await employerContext(db, req);
    if (!employer) return jsonError(res, 403, 'لا تملك جهة توظيف مرتبطة بهذا الحساب.', 'EMPLOYER_REQUIRED');
    const job = await db.prepare('SELECT * FROM job_posts WHERE id=? LIMIT 1').get<JobRow>(req.params.id);
    if (!job) return jsonError(res, 404, 'الإعلان غير موجود.', 'NOT_FOUND');
    if (job.employer_type !== employer.type || job.employer_id !== employer.id) return jsonError(res, 403, 'لا تملك هذا الإعلان.', 'FORBIDDEN');
    const applications = await db.prepare('SELECT * FROM job_applications WHERE job_post_id=? ORDER BY created_at DESC LIMIT 500').all<JobApplicationRow>(job.id);
    res.json({ job: jobPublic(job), applications: applications.map(applicationOwner) });
  });

  router.post('/jobs/:id/apply', csrfProtected, async (req: AuthenticatedRequest, res) => {
    const job = await db.prepare("SELECT * FROM job_posts WHERE id=? AND status='APPROVED' LIMIT 1").get<JobRow>(req.params.id);
    if (!job) return jsonError(res, 404, 'الوظيفة غير متاحة للتقديم.', 'JOB_NOT_AVAILABLE');
    if (req.body?.kuwaitiDeclaration !== true) return jsonError(res, 400, 'هذه البوابة مخصصة للكويتيين، ويلزم الإقرار قبل التقديم.', 'KUWAITI_DECLARATION_REQUIRED');
    const fullName = text(req.body?.fullName ?? req.auth!.user.name, 2, 120);
    const email = text(req.body?.email ?? req.auth!.user.email, 5, 254);
    const phone = text(req.body?.phone ?? req.auth!.user.phone, 7, 24);
    const summary = text(req.body?.summary, 0, 1600) ?? '';
    const yearsExperience = integer(req.body?.yearsExperience ?? 0, 0, 80);
    if (!fullName || !email || !phone || yearsExperience === undefined) return jsonError(res, 400, 'بيانات طلب التوظيف غير صالحة.', 'INVALID_APPLICATION');
    const id = `app_${randomUUID()}`, createdAt = now();
    try {
      await db.prepare(`INSERT INTO job_applications(id,job_post_id,applicant_user_id,full_name,email,phone,summary,years_experience,kuwaiti_declaration,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,1,'SUBMITTED',?,?)`).run(id,job.id,req.auth!.user.id,fullName,email,phone,summary,yearsExperience,createdAt,createdAt);
    } catch (error) {
      if (String(error).includes('UNIQUE') || String(error).includes('duplicate')) return jsonError(res, 409, 'سبق أن قدمت على هذه الوظيفة.', 'ALREADY_APPLIED');
      throw error;
    }
    await audit(db, req, 'KUWAIT_JOB_APPLIED', 'JOB_APPLICATION', id, undefined, { jobId: job.id });
    res.status(201).json({ id, status: 'SUBMITTED', note: 'الإقرار لا يعني أن المنصة تحققت من الجنسية. التحقق الرسمي يحتاج تكاملًا معتمدًا.' });
  });

  router.get('/admin/review-queue', async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'هذه الصفحة للإدارة فقط.', 'ADMIN_REQUIRED');
    const suppliers = await db.prepare("SELECT * FROM supplier_profiles WHERE verification_status IN ('PENDING','NEEDS_ACTION') ORDER BY created_at ASC LIMIT 200").all<SupplierRow>();
    const jobs = await db.prepare("SELECT * FROM job_posts WHERE status='PENDING_REVIEW' ORDER BY submitted_at ASC LIMIT 300").all<JobRow>();
    res.json({ suppliers: suppliers.map(supplierOwner), jobs: jobs.map(jobPublic) });
  });

  router.post('/admin/suppliers/:id/review', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'الاعتماد للإدارة فقط.', 'ADMIN_REQUIRED');
    const decision = text(req.body?.decision, 4, 20);
    if (!decision || !['VERIFIED','NEEDS_ACTION','SUSPENDED'].includes(decision)) return jsonError(res, 400, 'قرار الاعتماد غير صالح.', 'INVALID_DECISION');
    const before = await db.prepare('SELECT * FROM supplier_profiles WHERE id=? LIMIT 1').get<SupplierRow>(req.params.id);
    if (!before) return jsonError(res, 404, 'المورد غير موجود.', 'NOT_FOUND');
    if (decision === 'VERIFIED' && !text(before.commercial_registration_no, 3, 80)) {
      return jsonError(res, 409, 'لا يمكن اعتماد المورد قبل إدخال رقم السجل التجاري.', 'REGISTRATION_REQUIRED');
    }
    const adminNote = text(req.body?.adminNote, 0, 1000) ?? '';
    const reviewedAt = now();
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE supplier_profiles SET verification_status=?,admin_note=?,reviewed_by_user_id=?,reviewed_at=?,updated_at=? WHERE id=?')
        .run(decision,adminNote,req.auth!.user.id,reviewedAt,reviewedAt,before.id);
      await audit(tx, req, 'SUPPLIER_REVIEWED', 'SUPPLIER', before.id, before, { decision, adminNote });
    });
    const updated = await db.prepare('SELECT * FROM supplier_profiles WHERE id=?').get<SupplierRow>(before.id);
    res.json({ supplier: supplierOwner(updated!) });
  });

  router.post('/admin/jobs/:id/review', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'اعتماد الوظائف للإدارة فقط.', 'ADMIN_REQUIRED');
    const decision = text(req.body?.decision, 6, 20);
    if (!decision || !['APPROVED','REJECTED'].includes(decision)) return jsonError(res, 400, 'قرار الإعلان غير صالح.', 'INVALID_DECISION');
    const before = await db.prepare('SELECT * FROM job_posts WHERE id=? LIMIT 1').get<JobRow>(req.params.id);
    if (!before) return jsonError(res, 404, 'الإعلان غير موجود.', 'NOT_FOUND');
    if (before.status === 'CLOSED') return jsonError(res, 409, 'الإعلان مغلق ولا يمكن اعتماده.', 'JOB_CLOSED');
    const adminNote = text(req.body?.adminNote, 0, 1000) ?? '';
    const reviewedAt = now();
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE job_posts SET status=?,admin_note=?,reviewed_by_user_id=?,reviewed_at=?,updated_at=? WHERE id=?')
        .run(decision,adminNote,req.auth!.user.id,reviewedAt,reviewedAt,before.id);
      await audit(tx, req, 'KUWAIT_JOB_REVIEWED', 'JOB_POST', before.id, before, { decision, adminNote });
    });
    const updated = await db.prepare('SELECT * FROM job_posts WHERE id=?').get<JobRow>(before.id);
    res.json({ job: jobPublic(updated!) });
  });

  return router;
}
