#!/usr/bin/env node
/**
 * seed.ts – Creates demo user and 3 sample summary jobs.
 * Run: npx tsx scripts/seed.ts
 *
 * Demo user: demo@verisumm.com / demo1234
 * Documents:
 *   1. Biomedical abstract (SUPPORTED sentences expected)
 *   2. Clinical note with doses and negations
 *   3. Altered clinical note (5 mg → 50 mg) → visible red UNSUPPORTED flag
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';

// Add model-service to path for type sharing is not needed here
// We directly import backend models
const BACKEND_SRC = path.join(__dirname, '..', 'backend', 'src');

// We need to dynamically require the backend models
// To avoid ts compilation issues, we'll connect directly
async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';

  let mongoServer: any;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log('[Seed] Connected to MongoDB:', uri);
  } catch {
    console.warn('[Seed] MongoDB unreachable, using in-memory server');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    console.log('[Seed] Using in-memory MongoDB');
  }

  // ── Define models inline ──────────────────────────────────────────────────
  const { Schema, model, Types } = mongoose;

  // User
  let User: any;
  try { User = mongoose.model('User'); } catch {
    const UserSchema = new Schema({
      email: { type: String, required: true, unique: true, lowercase: true },
      passwordHash: { type: String, required: true },
      name: { type: String, required: true },
    }, { timestamps: true });
    User = model('User', UserSchema);
  }

  // Summary
  let Summary: any;
  try { Summary = mongoose.model('Summary'); } catch {
    const SummarySchema = new Schema({
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      title: String,
      sourceText: String,
      model: String,
      tau: { type: Number, default: 0.5 },
      longMode: { type: Boolean, default: false },
      status: { type: String, default: 'pending' },
    }, { timestamps: true });
    Summary = model('Summary', SummarySchema);
  }

  // AuditLog
  let AuditLog: any;
  try { AuditLog = mongoose.model('AuditLog'); } catch {
    const AuditSchema = new Schema({
      summaryId: { type: Schema.Types.ObjectId, ref: 'Summary' },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      action: String,
      modelId: String,
      details: Schema.Types.Mixed,
      timestamp: { type: Date, default: Date.now },
    });
    AuditLog = model('AuditLog', AuditSchema);
  }

  // ── Demo user ─────────────────────────────────────────────────────────────
  let demoUser = await User.findOne({ email: 'demo@verisumm.com' });
  if (!demoUser) {
    const passwordHash = await bcrypt.hash('demo1234', 12);
    demoUser = await User.create({
      email: 'demo@verisumm.com',
      name: 'Demo User',
      passwordHash,
    });
    console.log('[Seed] Created demo user: demo@verisumm.com / demo1234');
  } else {
    console.log('[Seed] Demo user already exists');
  }

  // ── Sample documents ──────────────────────────────────────────────────────
  const doc1 = {
    title: 'Biomedical Abstract – Metformin in T2DM',
    model: 'pegasus-pubmed' as const,
    text: `Type 2 diabetes mellitus (T2DM) is a chronic metabolic disorder characterized by insulin resistance and 
progressive beta-cell dysfunction. Metformin remains the first-line pharmacological therapy for T2DM 
management, with an established safety profile over six decades of clinical use. A randomized controlled 
trial involving 847 patients with newly diagnosed T2DM was conducted across 12 centers in 2019. 
Patients received either metformin 500 mg twice daily (n=423) or placebo (n=424) for 24 weeks. 
The primary endpoint was change in HbA1c from baseline. Metformin treatment resulted in a mean HbA1c 
reduction of 1.2% compared with 0.2% in the placebo group (p < 0.001). Secondary endpoints included 
fasting plasma glucose, body weight, and lipid profiles. Fasting plasma glucose decreased by 28.4 mg/dL 
in the metformin group vs. 4.1 mg/dL in the placebo group. Body weight was reduced by 2.3 kg in the 
metformin group. Adverse events were predominantly gastrointestinal (nausea, diarrhea) and occurred in 
32% of metformin recipients. No cases of lactic acidosis were reported. Metformin 500 mg twice daily 
effectively reduces HbA1c and fasting plasma glucose with an acceptable safety profile in patients with 
newly diagnosed T2DM.`,
  };

  const doc2 = {
    title: 'Clinical Note – Hypertension Management',
    model: 'bart-large-cnn' as const,
    text: `PATIENT: John D., 58-year-old male
CHIEF COMPLAINT: Follow-up for hypertension and hyperlipidemia management.

HISTORY: Patient presents for routine follow-up. He has a 10-year history of essential hypertension 
controlled on amlodipine 5 mg once daily. Blood pressure today is 138/88 mmHg, improved from 
155/95 mmHg at last visit. He denies chest pain, shortness of breath, or palpitations. No history 
of myocardial infarction or stroke. Patient reports no side effects from current medications.

MEDICATIONS: Amlodipine 5 mg once daily, atorvastatin 20 mg at bedtime.

PHYSICAL EXAM: Blood pressure 138/88 mmHg right arm, 136/86 mmHg left arm. Heart rate 72 bpm, regular. 
BMI 27.3 kg/m2. No peripheral edema. Absence of bruits on auscultation.

LABS: Total cholesterol 185 mg/dL, LDL 110 mg/dL, HDL 52 mg/dL, triglycerides 140 mg/dL. 
Creatinine 0.9 mg/dL, eGFR > 60 mL/min/1.73m2. HbA1c 5.6%.

ASSESSMENT AND PLAN: Blood pressure is improving but not yet at goal of < 130/80 mmHg. 
Will increase amlodipine from 5 mg to 10 mg once daily. Continue atorvastatin 20 mg. 
Patient instructed to maintain low-sodium diet and perform aerobic exercise 30 minutes, 5 days per week. 
Follow-up in 6 weeks.`,
  };

  const doc3 = {
    title: 'Clinical Note – Dose Error Demo (5mg → 50mg)',
    model: 'bart-large-cnn' as const,
    text: `PATIENT: Jane S., 65-year-old female
CHIEF COMPLAINT: Follow-up for heart failure and atrial fibrillation.

HISTORY: Patient has a history of heart failure with reduced ejection fraction (HFrEF, EF 35%) 
and persistent atrial fibrillation. She is currently managed with carvedilol 50 mg twice daily 
for rate control and heart failure. Blood pressure today is 118/72 mmHg. She reports mild dyspnea 
on exertion but no orthopnea or paroxysmal nocturnal dyspnea. She denies chest pain.

MEDICATIONS: Carvedilol 50 mg twice daily, furosemide 40 mg once daily, lisinopril 5 mg once daily, 
warfarin 5 mg daily (INR target 2-3).

NOTE FOR DEMO: The lisinopril dose above has been intentionally altered from the correct 5 mg to 
demonstrate the VeriSumm factual verifier. The original source had lisinopril 5 mg. Any AI summary 
claiming a different dose should be flagged in red with the reason 'number/dose not found in source'.

PHYSICAL EXAM: BP 118/72 mmHg, HR 78 bpm irregular. JVP elevated 3 cm above sternal angle. 
Bilateral crackles at lung bases. 2+ pitting edema bilateral ankles.

LABS: BNP 485 pg/mL (elevated), creatinine 1.1 mg/dL, potassium 4.2 mEq/L, INR 2.4.

ASSESSMENT AND PLAN: Heart failure remains compensated. Atrial fibrillation rate controlled. 
Continue current medications. Increase furosemide to 60 mg daily for residual fluid overload. 
Repeat BNP and renal panel in 4 weeks.`,
  };

  // Create sample summary jobs (status pending – they need model service to process)
  for (const doc of [doc1, doc2, doc3]) {
    const existing = await Summary.findOne({ userId: demoUser._id, title: doc.title });
    if (!existing) {
      const s = await Summary.create({
        userId: demoUser._id,
        title: doc.title,
        sourceText: doc.text,
        model: doc.model,
        tau: 0.5,
        longMode: false,
        status: 'pending',
      });
      await AuditLog.create({
        summaryId: s._id,
        userId: demoUser._id,
        action: 'submit',
        modelId: doc.model,
        details: { seeded: true },
      });
      console.log('[Seed] Created sample:', doc.title);
    } else {
      console.log('[Seed] Already exists:', doc.title);
    }
  }

  console.log('\n✅ Seed complete.');
  console.log('   Login: demo@verisumm.com / demo1234');
  console.log('   Note: sample summaries are status=pending; start the server to process them.');

  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error('[Seed] Fatal:', e.message);
  process.exit(1);
});
