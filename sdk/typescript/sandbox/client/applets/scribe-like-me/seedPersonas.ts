/**
 * Synthetic starter data: four clinician personas with deliberately distinct
 * documentation styles, each with a small bundle of historical notes, plus a
 * couple of shared sample transcripts. All patients are fictional.
 *
 * These exist purely to validate the concept the moment you open the applet —
 * "create new persona" walks through the same upload flow for a real
 * clinician's own notes. The four styles are chosen to differ along axes a
 * tailoring agent should pick up on:
 * - Dr. Marquez (pediatrics) vs. Dr. Okafor (internal medicine): same terse
 *   vs. narrative axis as before, but now also different patient population
 *   (well-child/peds acute visits vs. adult chronic disease) so the two
 *   aren't just stylistic mirrors of each other.
 * - Dr. Jones (psychiatry): long narrative notes carrying session detail —
 *   direct quotes, affect, defenses, family/relationship material — that a
 *   generic note template's content prompts would normally compress away.
 * - Dr. Patel (colorectal surgery): structurally different note *types*
 *   altogether (preoperative H&P, procedure/operative note) with dense,
 *   technical, procedure-specific content rather than a general encounter.
 * Generating from the *same* transcript under each tailored profile should
 * produce visibly different notes.
 */

export interface SeedPersona {
  name: string;
  specialty: string;
  notes: string[];
}

export const SEED_PERSONAS: SeedPersona[] = [
  {
    name: "Dr. Elena Marquez",
    specialty: "Pediatrics",
    notes: [
      `CC: fever/ear pain x2d
HPI: 18mo M brought in by mom for fever to 101.5 and pulling at R ear x2d. Fussy, decreased PO intake, sleeping poorly. No cough, no vomiting/diarrhea. No known sick contacts, started daycare 3wks ago. Tylenol given w/ some relief.
ROS: (+) fever, ear tugging, fussiness. (-) cough, congestion, rash, vomiting, diarrhea.
PE: T 101.2, HR 128, RR 26, wt 11.2kg (50th%ile). Alert, consolable, NAD. R TM erythematous/bulging, landmarks obscured. L TM nl. Oropharynx clear. Lungs CTAB. No rash.
A: Acute otitis media, R ear.
P:
1. Amoxicillin 40mg/kg/day div BID x10d
2. Tylenol/ibuprofen prn fever/pain
3. Return if fever persists >48h on abx, worsening, or new sx
4. RTC 2-3wks for recheck if not improved`,
      `CC: barky cough overnight
HPI: 2yo F, sudden-onset barky/seal-like cough starting overnight, worse when crying/agitated, better when calm in cool air on drive over. Mild fever, runny nose x1d prior. No stridor at rest currently. No drooling, no difficulty swallowing, no cyanosis reported. Immunized, no prior similar episodes.
ROS: (+) barky cough, low-grade fever, rhinorrhea. (-) stridor at rest, drooling, cyanosis, vomiting.
PE: T 100.4, HR 118, RR 24, SpO2 99% RA. Alert, playful, NAD at rest. Mild inspiratory stridor only w/ agitation/crying, resolves w/ calming. No retractions at rest. Lungs clear, good air entry bilat. Oropharynx nl, no drooling.
A: Mild croup (laryngotracheobronchitis).
P:
1. Single dose oral dexamethasone 0.6mg/kg given in office
2. Cool mist/cool night air prn, keep calm
3. Return precautions: stridor at rest, retractions, cyanosis, poor PO -> ED
4. Expect improvement over 24-48h, call if worsening`,
      `CC: asthma f/u
HPI: 11yo M, known persistent asthma on daily fluticasone MDI, here for routine f/u. Mom reports albuterol rescue use ~1x/wk, mostly w/ soccer practice. No nighttime awakenings past month. No recent ED visits or steroid bursts x6mo. Uses spacer, technique reportedly good per mom.
ROS: (+) occasional exertional cough. (-) nighttime sx, wheeze at rest, chest tightness.
PE: Wt/ht tracking well on growth curve. Lungs CTAB, no wheeze, no accessory muscle use. Peak flow 92% of personal best.
A: Persistent asthma, well controlled.
P:
1. Continue fluticasone MDI daily, review technique/spacer use today
2. Continue albuterol prn pre-exercise and for sx
3. Reviewed asthma action plan w/ mom and patient
4. RTC 6 months, sooner if increased rescue use or nighttime sx`,
      `CC: well visit, 16yo F
HPI: Here for annual well visit. No acute complaints. Doing well in school, plays volleyball. Menses regular, LMP 2wks ago. Denies sexual activity. Screened w/ PHQ-9A today - score 4, denies SI/HI. Sleep ~7hrs/night, reports some stress around upcoming exams. Diet/exercise reviewed, no substance use reported on screening.
ROS: neg except mild exam-related stress noted above.
PE: Wt/ht/BMI reviewed w/ patient, tracking appropriately. Tanner stage discussed briefly. Skin: mild facial acne, comedonal. Heart/lungs/abd nl. Spine nl, no scoliosis on exam.
A: Well adolescent visit. Mild comedonal acne. Low-level exam stress, PHQ-9A reassuring.
P:
1. Routine labs deferred, up to date on immunizations - confirmed HPV series complete
2. OTC benzoyl peroxide for acne, f/u if not improved in 6-8wks
3. Discussed stress management, sleep hygiene; screen reassuring, no referral needed today
4. RTC 1yr for next well visit, sooner for any concerns`,
    ],
  },
  {
    name: "Dr. James Okafor",
    specialty: "Internal Medicine",
    notes: [
      `History of Present Illness: The patient is a 34-year-old woman presenting with a four-day history of productive cough and nasal congestion, accompanied by a low-grade fever. She describes the cough as "getting a little better than yesterday" but still bothersome overnight. She denies shortness of breath, chest pain, or gastrointestinal symptoms, and has had no known sick contacts. She attempted over-the-counter pseudoephedrine with only modest symptomatic relief.

Physical Examination: Temperature 99.8F, heart rate 82, respiratory rate 16, oxygen saturation 98% on room air. The patient is in no acute distress. Oropharynx is mildly erythematous without exudate. Lungs are clear to auscultation bilaterally. No cervical lymphadenopathy is appreciated.

Assessment: This presentation is most consistent with a viral upper respiratory tract infection that appears to be in its resolving phase, and I do not find evidence at this time to suggest a bacterial process warranting antibiotic therapy.

Plan: I counseled the patient on supportive measures including hydration, rest, and continued use of an over-the-counter decongestant as needed. I discussed specific return precautions, advising her to seek care if her fever exceeds 101F, if her symptoms significantly worsen, or if she develops shortness of breath.`,
      `History of Present Illness: The patient is a 58-year-old man returning for routine follow-up of his hypertension. He has been keeping a home blood pressure log, which we reviewed together today; his readings have averaged 138/86 over the past two weeks. He reports excellent adherence to lisinopril 10 mg daily and denies any missed doses. He specifically denies chest pain, palpitations, headache, or visual changes.

Physical Examination: Blood pressure in clinic today was 142/88, heart rate 74. Weight is stable compared to his last visit. Cardiac exam reveals a regular rate and rhythm without murmurs, rubs, or gallops. Lungs are clear. No peripheral edema is noted.

Assessment: I discussed with the patient that, despite good medication adherence, his blood pressure remains above goal, both by home monitoring and in clinic today, indicating suboptimal control on his current regimen.

Plan: We discussed increasing his lisinopril to 20 mg daily, and he understood and agreed with this adjustment. I encouraged continued attention to a low-sodium diet and ongoing home blood pressure monitoring. I ordered a basic metabolic panel today given the dose increase and asked him to return in six weeks for reassessment.`,
      `History of Present Illness: The patient is a 45-year-old man who presents with a one-week history of acute low back pain that began after lifting heavy boxes while moving. He rates the pain as 6 out of 10, noting it worsens with bending forward and improves somewhat with rest and NSAIDs. He denies any radiation of pain into the legs, numbness, tingling, or changes in bowel or bladder function. He recalls no prior episodes of similar back pain.

Physical Examination: On examination, there is tenderness to palpation over the lumbar paraspinal muscles, more pronounced on the left, without midline bony tenderness. Straight leg raise testing is negative bilaterally. Strength and sensation are intact throughout the lower extremities, and his gait is normal.

Assessment: In speaking with him and examining him, I do not find any red-flag features -- no fever, unintentional weight loss, saddle anesthesia, or incontinence -- and this appears to be an acute mechanical low back strain.

Plan: I recommended NSAIDs as needed and encouraged him to remain as active as tolerated rather than resting in bed, along with heat and gentle stretching. Should his symptoms fail to improve over the next two weeks, I would consider a referral to physical therapy. I reviewed return precautions with him in detail.`,
      `History of Present Illness: The patient is a 61-year-old woman with type 2 diabetes mellitus managed on metformin 1000 mg twice daily, here for routine follow-up. We reviewed her home glucose log together; her fasting readings have generally ranged from 130 to 150. She describes her dietary adherence as "fair" and reports exercising approximately twice weekly. She denies polyuria, polydipsia, and any episodes of hypoglycemia.

Physical Examination: Weight today is 178 pounds, down two pounds since her last visit. Foot examination reveals no ulcerations, palpable pulses bilaterally, and intact monofilament sensation.

Assessment: Overall, her diabetes control appears fair on her current regimen, and I had a detailed conversation with her about the importance of continued dietary modification and increased physical activity to help improve her glycemic control further.

Plan: We will continue metformin 1000 mg twice daily for now. I ordered a hemoglobin A1c and lipid panel today. I reinforced counseling around diet and exercise and confirmed she is due for her annual diabetic eye examination, which I will refer her for if not already completed. I asked her to return in three months.`,
    ],
  },
  {
    name: "Dr. Henry Jones",
    specialty: "Psychiatry",
    notes: [
      `This was our sixth session together, fifty minutes, and Maria arrived a few minutes late, apologizing twice before she'd even sat down -- something I noted as consistent with the pattern of anticipatory guilt we've discussed before. She opened by saying "I almost cancelled again," and when I asked what had stopped her, she said it was remembering something I'd said last time about how cancelling had become a way of testing whether people would chase her. She held eye contact when she said this, which is new; in earlier sessions she would look at her hands during anything that touched on the fear of abandonment.

We spent the first twenty minutes or so on the situation with her sister -- apparently there was a family dinner last weekend where her sister brought up their mother's illness in a way Maria experienced as accusatory, implying Maria wasn't doing enough. Maria described going quiet, then leaving early, then crying in the car for "probably twenty minutes" before she felt able to drive. She said, verbatim, "I don't even know what I was crying about, it wasn't really about the dinner." I reflected that this sounds like the dinner activated something older, and asked her to stay with the feeling rather than the story. After a long pause she said it felt like being nine years old again, waiting for her mother to notice she'd set the table without being asked. This is the first time she's connected the current relational pattern -- performing helpfulness and then feeling invisible when it isn't acknowledged -- explicitly back to that specific childhood memory rather than describing it in the abstract.

We also checked in on the sertraline, now at week 5 of the increased dose (150mg). She reports sleep has improved, waking once instead of three or four times a night, and appetite is back to baseline. No activation, no increased anxiety, denies any suicidal ideation currently or at any point since last visit -- I asked this directly and she answered without hesitation, which I'm noting given her history of minimizing. She did mention some emotional blunting, "like I don't cry at movies anymore, which is honestly kind of nice," and we discussed that this is a known and generally acceptable tradeoff for her given how destabilizing the crying spells were three months ago.

Toward the end of the session she brought up, almost as an aside while gathering her things, that she'd had a dream about her father the night before the family dinner -- her father died when she was fourteen, and this is only the second time she's mentioned him unprompted in six sessions. I made a note to open with this next time rather than pursuing it in the last five minutes, given how guarded she's historically been about that material and how much groundwork the sister material took today.

Plan: continue sertraline 150mg, reassess in 4 weeks or sooner if needed. Continue weekly therapy. Will open next session with the father material if she doesn't bring it up herself. No medication changes today. Safety: no SI/HI, no plan, no means, contracted informally for safety as in prior visits.`,
      `Fifty-minute session, second visit since discharge from the partial hospitalization program three weeks ago. David presented today notably more animated than the last two visits -- speaking faster, making more eye contact, at one point laughing genuinely at something he said about his roommate, which stood out because I haven't seen him laugh in session before. He denied feeling "up" in the way he described before his last manic episode, and when I asked him to compare today's energy to how he felt in the week before he was hospitalized, he was able to articulate a meaningful difference: he said the hospitalization-week version of himself felt like "there wasn't a gap between having a thought and doing something about it," whereas today he still feels like there's "a beat where I can catch myself." I think this distinction is clinically important and I want to keep tracking his own language for it rather than imposing my own framework.

We went through his mood chart together in detail -- he's been doing the daily 1-10 rating plus sleep hours as we set up at discharge. Sleep has been consistently 6.5-7.5 hours, no nights under 5, which is a meaningful change from the 3-4 hours he was getting before admission. Mood ratings have ranged 5-7 without dipping into the 2-3 range that characterized the depressive swings last spring. He did flag one day, this past Tuesday, rated an 8, where he said he "wanted to start four projects at once" and had to consciously talk himself down using the skills from the PHP groups -- specifically the 24-hour rule before committing to anything new. I spent time validating how hard that must have been to catch in real time and asked him to walk me through exactly what he did, step by step, which he did in quite a bit of detail: he said he wrote the four ideas down, set a timer for the next day, and texted his sister "getting excited about stuff again, might be a sign" as an accountability check. I want to note this because it's exactly the kind of insight-driven self-monitoring behavior we were hoping the PHP would build, and it's working.

Medication-wise, he's tolerating lithium 900mg at night well, no tremor, no GI upset, denies polyuria/polydipsia. Level drawn today, results pending. Also continuing lamotrigine 200mg, fully titrated as of 3 weeks ago, no rash, no other concerns. He asked several questions about how long he'd need to stay on both medications, and we had a longer conversation than usual about the difference between acute stabilization and maintenance treatment, and his own ambivalence about "being on drugs forever" versus his very real fear of another hospitalization -- he was candid that the last manic episode cost him his job and nearly his relationship, and he doesn't want to relitigate that trade-off lightly.

We also spent meaningful time on his relationship with his girlfriend, who apparently sat in on part of the family session during his PHP stay and has since been, in his words, "walking on eggshells," which is frustrating him because he feels stable now but senses she doesn't fully believe it yet. We discussed the concept of trust rebuilding taking longer than symptom stabilization, and I encouraged him to consider bringing her to a session so we can address this together rather than him managing her anxiety on top of his own recovery.

Plan: continue lithium 900mg qhs, lamotrigine 200mg daily, lithium level pending from today's draw, will call with results. Continue mood chart daily. Follow up in 2 weeks. Discussed possibility of a conjoint session with girlfriend, he will think about it and let me know. No acute safety concerns, no SI/HI, denies any thoughts of self-harm.`,
    ],
  },
  {
    name: "Dr. Tim Patel",
    specialty: "Colorectal Surgery",
    notes: [
      `PREOPERATIVE EVALUATION

Indication: Newly diagnosed sigmoid adenocarcinoma, referred for surgical planning.

History of Present Illness: 64-year-old male referred following colonoscopy performed for a positive FIT test, which revealed a 4cm partially obstructing mass in the sigmoid colon at approximately 30cm from the anal verge. Biopsy confirmed moderately differentiated invasive adenocarcinoma. Patient reports a 3-month history of intermittent left lower quadrant cramping and a noticeable change in stool caliber, denies hematochezia, melena, or unintentional weight loss. No family history of colorectal cancer. Staging CT chest/abdomen/pelvis shows no evidence of metastatic disease; CEA is elevated at 6.2.

PMH: Hypertension, well controlled on lisinopril. Type 2 diabetes, diet-controlled, HbA1c 6.4. No prior abdominal surgery.
Medications: Lisinopril 10mg daily, low-dose aspirin 81mg daily (to be held per standard protocol prior to surgery).
Allergies: NKDA.
Social History: Former smoker, quit 15 years ago, 20 pack-year history. Occasional alcohol use. Lives with spouse, independent in ADLs.
Family History: No colorectal or other GI malignancy. Father with CAD.

Review of Systems: Negative except as noted in HPI. No dyspnea, no chest pain, no urinary symptoms.

Physical Exam: Vitals stable, BMI 27. Abdomen soft, mildly tender to deep palpation LLQ, no palpable mass, no distension, no peritoneal signs. Rectal exam: normal tone, no palpable rectal mass, guaiac not performed given known colonoscopic findings.

Labs/Imaging: CBC, CMP within normal limits. CEA 6.2 (elevated). CT C/A/P: sigmoid mass without evidence of nodal or distant metastasis. No hydronephrosis.

Assessment: Sigmoid adenocarcinoma, clinical stage appears localized (cT3N0 pending final pathologic staging), appropriate candidate for elective minimally invasive resection.

Plan: Scheduled for laparoscopic (converting to open if needed) sigmoid colectomy with primary anastomosis. Bowel prep and preoperative antibiotics per protocol. Aspirin held 7 days prior to surgery, continue other home medications through morning of surgery with sip of water. Discussed risks in detail including but not limited to bleeding, infection, anastomotic leak, need for temporary or permanent stoma, injury to adjacent structures (ureter, bladder, small bowel), conversion to open procedure, and recurrence of malignancy. Patient verbalized understanding and consented to proceed. Preoperative anesthesia clearance obtained. Case scheduled, patient to follow standard preop instructions including bowel prep the day prior.`,
      `PROCEDURE NOTE

Preoperative Diagnosis: Average-risk screening, age 52, no prior colonoscopy.
Postoperative Diagnosis: Two sigmoid polyps, otherwise normal colonoscopy to cecum.

Procedure Performed: Colonoscopy with polypectomy.

Indications: Screening colonoscopy in an average-risk 52-year-old with no personal or family history of colorectal neoplasia, no prior colonoscopy.

Anesthesia: Monitored anesthesia care per anesthesiology, patient tolerated sedation well throughout.

Procedure in Detail: After informed consent was obtained and confirmed, the patient was placed in the left lateral decubitus position. The colonoscope was inserted through the rectum and advanced under direct visualization to the cecum, identified by visualization of the ileocecal valve, appendiceal orifice, and confluence of the taeniae. Cecal intubation time was 6 minutes. Withdrawal time was 12 minutes with careful circumferential inspection of the mucosa.

Findings: The cecum, ascending colon, hepatic flexure, transverse colon, splenic flexure, and descending colon were normal in appearance with no polyps, masses, or areas of inflammation identified. In the sigmoid colon, a 6mm sessile polyp was identified at approximately 35cm and removed in its entirety via cold snare technique, retrieved for pathology. A second, 4mm sessile polyp was identified at approximately 25cm, also removed via cold snare in a single piece, retrieved for pathology. Hemostasis was confirmed at both polypectomy sites without need for additional intervention. The rectum was normal, retroflexed view obtained showing no masses or hemorrhoidal disease of significance. The scope was withdrawn.

Estimated Blood Loss: Minimal, less than 5mL.
Complications: None.
Specimens: Two sigmoid polyps sent to pathology in separate labeled containers.

Impression: Two diminutive sigmoid polyps, removed completely via cold snare polypectomy. Otherwise normal colonoscopy to the cecum with adequate bowel preparation.

Recommendations: Await final pathology. Based on preliminary endoscopic appearance (two small tubular-appearing polyps), if pathology confirms low-risk adenoma(s), recommend repeat colonoscopy in 7-10 years per average-risk surveillance guidelines; interval will be adjusted if pathology shows advanced or high-risk features. Patient advised of expected mild bloating today, to resume normal diet as tolerated, and given standard post-polypectomy bleeding precautions with instructions to seek care immediately for significant rectal bleeding, severe abdominal pain, or fever.`,
    ],
  },
];

export interface SampleTranscript {
  id: string;
  title: string;
  text: string;
}

export const SAMPLE_TRANSCRIPTS: SampleTranscript[] = [
  {
    id: "diabetes-followup",
    title: "Diabetes follow-up (type 2)",
    text: `Doctor: Good morning, come on in. So it's been about three months since we last adjusted things. How have you been feeling?
Patient: Pretty good overall. A little tired some afternoons, but nothing too bad.
Doctor: Okay. Did you get a chance to keep checking your sugars at home?
Patient: Yeah, I've been checking most mornings. They've been running around 140, sometimes 150 if I don't watch what I eat the night before.
Doctor: And any low blood sugars, shakiness, sweating, anything like that?
Patient: No, nothing like that.
Doctor: Good. How about the metformin, any stomach upset, diarrhea?
Patient: No, I've gotten used to it. I take it with food like you said.
Doctor: Great. And diet and exercise - how's that going?
Patient: Honestly not as good as I should. I've been walking maybe once a week. Work's been busy.
Doctor: Understandable. Any numbness or tingling in your feet? Any sores or wounds you've noticed?
Patient: No, feet feel normal.
Doctor: Any blurry vision or other changes?
Patient: No.
Doctor: Okay, let's take a look. Your weight today is 182, that's up about 3 pounds since last visit. Blood pressure is 128 over 80, that's fine. Let me check your feet... pulses feel good, sensation is intact, no ulcers or redness, that all looks good.
Patient: That's good to hear.
Doctor: I'm going to order your A1c and a lipid panel today. Based on your home readings running a bit high still, I think it makes sense to increase your metformin to 1000 twice a day if you're tolerating it well, and I'd really like you to try to get back to at least two or three walks a week.
Patient: Okay, I can try to do that.
Doctor: When was your last eye exam?
Patient: I think it's been over a year.
Doctor: Let's get that scheduled, it's important for your eyes with diabetes. I'll have the front desk send a referral. Let's plan to see you back in three months, sooner if your sugars are running high or if you have any of the symptoms we talked about.
Patient: Sounds good, thank you.`,
  },
  {
    id: "back-pain",
    title: "Acute low back pain",
    text: `Doctor: What brings you in today?
Patient: My lower back has been killing me since last weekend. I was helping my brother move some furniture and I think I twisted it wrong.
Doctor: Sorry to hear that. So about a week now?
Patient: Yeah, about six days.
Doctor: Can you point to where it hurts most?
Patient: Mostly right here on the left side, low down.
Doctor: On a scale of zero to ten, how bad is it right now?
Patient: Maybe a six. It's worse when I bend over to tie my shoes.
Doctor: Does it shoot down your leg at all, or stay in your back?
Patient: Just stays in my back, doesn't go down my leg.
Doctor: Any numbness, tingling, or weakness in your legs?
Patient: No, nothing like that.
Doctor: Any problems with your bladder or bowels, any accidents or trouble controlling them?
Patient: No, thankfully nothing like that.
Doctor: Have you had back pain like this before?
Patient: Not really, maybe some soreness after workouts but nothing like this.
Doctor: Any fevers, chills, or unexplained weight loss recently?
Patient: No.
Doctor: Okay, let's have a look. I'm going to press along your spine here... does that hurt? How about here on the left side muscles?
Patient: Yeah, that left side is tender.
Doctor: I'm going to lift your leg up straight, tell me if that reproduces the pain going down your leg... Okay, that's negative, good. Let's check your strength - push against my hand... good, and the other side... good, strength is equal. Let me check your reflexes too, those look normal. Your walking looks normal as well.
Patient: So what's going on?
Doctor: This looks like a mechanical muscle strain from the lifting - nothing that's pressing on a nerve, no red flag signs. The good news is these usually improve over a couple of weeks. I'd recommend ibuprofen as needed, and importantly, staying as active as you can tolerate rather than lying in bed, along with some heat and gentle stretching.
Patient: Okay, so keep moving, got it.
Doctor: Exactly. If it's not improving in about two weeks, or if you develop any numbness, weakness, or bladder or bowel changes, come back in sooner and we'll consider physical therapy or imaging at that point.
Patient: Okay, that makes sense, thank you.`,
  },
  {
    id: "psych-med-management",
    title: "Psychiatry: medication follow-up",
    text: `Doctor: Good to see you, come on in. It's been about a month since we bumped up the sertraline. How are you feeling?
Patient: Better, honestly. Not perfect, but better. I'd say maybe a six or seven most days instead of a three.
Doctor: That's a meaningful jump. Tell me more about what's different.
Patient: I'm not lying awake at 2am replaying every conversation I had that day anymore. I still have moments, like yesterday my boss sent this one-line email, just "can we talk tomorrow," and I spiraled for like an hour thinking I was getting fired. But an hour is a lot better than the whole night, which is what used to happen.
Doctor: What did you do with that hour of spiraling?
Patient: Actually I used the thing we talked about, I wrote down what I was afraid of versus what I actually knew, and it helped a little. Not completely, but I could function.
Doctor: I want to acknowledge that, that's exactly the skill we've been building. How's sleep otherwise, apart from that one night?
Patient: Pretty good. Falling asleep faster, maybe fifteen minutes instead of an hour plus. Waking up once, not four times.
Doctor: Any side effects from the medication? Nausea, sexual side effects, feeling flat or numb emotionally?
Patient: A little bit of the flat thing, actually. Like, my daughter did something really funny last week and I noticed I smiled but didn't really feel it the way I used to.
Doctor: That's useful to know. On a scale where zero is no blunting and ten is feeling nothing at all, where would you put that?
Patient: Maybe a two or three. It's noticeable but it's not bothering me enough to want to go back to how things were.
Doctor: Okay, we'll keep an eye on that, but it sounds like the tradeoff feels worth it to you right now.
Patient: Definitely. The anxiety was so much worse.
Doctor: Let's talk about your appetite and weight.
Patient: About the same. Maybe down a pound or two but nothing major.
Doctor: Good. And I want to check in directly, as I always do - any thoughts of hurting yourself, any thoughts that you'd be better off not here?
Patient: No, honestly no. There was a rough patch two months ago where I had some passive thoughts, like "it would be easier if I just didn't wake up," but nothing like that lately at all.
Doctor: I really appreciate you being upfront about that history and about where you are now. No plan, no intent, nothing like that currently?
Patient: No, nothing like that.
Doctor: Good. How's things with your husband? Last time you mentioned some tension around how much you'd been withdrawing.
Patient: It's better. We actually had a real conversation, not a fight, about how the anxiety had been making me cancel plans with his family and how that was affecting him too. He said he felt relieved I was finally talking instead of just going quiet.
Doctor: That sounds like real progress, and it lines up with what we'd hope to see as the anxiety symptoms come down - more capacity to engage rather than withdraw.
Patient: Yeah, I hadn't really put those two things together until you just said it.
Doctor: How about work? You mentioned the promotion stress a few sessions back.
Patient: Still stressful, but manageable. I got the new role, it starts in three weeks. I'm nervous, but it's more excited-nervous than dread-nervous, if that makes sense.
Doctor: That distinction matters a lot clinically, actually. Let's plan to check in shortly after you start the new role since transitions can be a vulnerable time even when things are otherwise going well.
Patient: That makes sense, I hadn't thought of it that way.
Doctor: For now, I think we hold the sertraline at the current dose given how much progress you've made, and we'll reassess the emotional blunting at the next visit - if it gets more bothersome we have options, but I don't want to rock the boat if it's not affecting your life.
Patient: Sounds good to me.
Doctor: And let's keep the CBT appointments going every other week as we've been doing, they seem to be reinforcing what's happening here.
Patient: Yeah, I'll keep those up.
Doctor: Great, let's plan to see you back in four weeks, sooner if anything changes or if those passive thoughts come back at all - you have my after-hours line.
Patient: Okay, thank you, I really do feel like myself again more days than not.`,
  },
  {
    id: "colorectal-preop-consult",
    title: "Colorectal surgery: preop consultation",
    text: `Doctor: Thanks for coming in. I know Dr. Alvarez sent over your colonoscopy results, but let's go through everything together so you understand exactly what we're dealing with and what I'm proposing.
Patient: Okay, I appreciate that. Honestly since the call I've just been anxious, I haven't processed much of it.
Doctor: That's completely understandable, a lot of people feel that way. So, to summarize - the colonoscopy found a mass in your sigmoid colon, that's the lower left part of your large intestine, and the biopsy confirmed it's cancer.
Patient: Right, adenocarcinoma, I think is what they called it.
Doctor: Correct. The good news, and there is good news here, is that the CT scans of your chest, abdomen, and pelvis did not show any spread to your liver, lungs, or lymph nodes beyond what we'd expect right around the tumor itself. So this looks like it's caught at a stage where surgery can be the primary treatment.
Patient: So I wouldn't need chemo?
Doctor: Based on the imaging, if the final pathology after surgery confirms what we're seeing now, you may not need chemotherapy, but that decision partly depends on what we find when we remove the tumor and examine the lymph nodes under the microscope. I don't want to promise something before we have that information.
Patient: That makes sense. So what exactly are you planning to do?
Doctor: I'm recommending a laparoscopic sigmoid colectomy. That means using small incisions and a camera to remove the segment of colon containing the tumor, along with the surrounding lymph nodes, and then reconnecting the two healthy ends of colon back together.
Patient: Will I need a bag? A colostomy? That's honestly my biggest fear.
Doctor: I understand why that's front of mind. In the vast majority of sigmoid colectomy cases like yours, we're able to reconnect the colon in the same operation without any stoma at all. There's a small chance, if there's a lot of inflammation or if something doesn't look right at the time of surgery, that we'd need a temporary ostomy to let the reconnection heal, but that would almost always be temporary, reversed in a few months. A permanent stoma would be very unusual for this specific situation.
Patient: Okay, that's a relief to hear, even with the small chance.
Doctor: Let's talk about the surgery itself and the risks, since I want you to go into this with full understanding. Every operation carries risk of bleeding, infection, and reaction to anesthesia. Specific to this surgery, there's a risk of what's called an anastomotic leak, where the reconnected bowel doesn't heal properly - that happens in a small percentage of cases and sometimes requires a return trip to the operating room. There's also a small risk of injury to nearby structures like the ureter or bladder, and a chance we'd need to convert from the small-incision approach to a larger open incision if the anatomy is difficult to see.
Patient: How long is the surgery usually, and how long would I be in the hospital?
Doctor: The operation itself typically takes two to three hours. Most patients stay in the hospital three to five days afterward, depending on how quickly your bowel function returns and how well you're managing pain.
Patient: And recovery after that, at home?
Doctor: Most people are back to relatively normal activity within four to six weeks, though heavy lifting and strenuous exercise need to wait a bit longer than that. We'll go over specific restrictions before you leave the hospital.
Patient: What about before the surgery, is there anything I need to do to prepare?
Doctor: Yes, you'll do a bowel prep the day before, similar to what you did for the colonoscopy, and I'll have you stop your aspirin about a week beforehand since you mentioned you take it daily. We'll also get you cleared by anesthesia given your blood pressure history, just a standard precaution.
Patient: Okay. And after the pathology comes back, that's when we'd know about chemo?
Doctor: Exactly. Once we have the final staging from pathology, we'll sit down with you again, and if appropriate, involve medical oncology to discuss whether additional treatment would reduce the risk of recurrence.
Patient: This is a lot to take in, but I feel better having it laid out like this.
Doctor: That's exactly the goal. Do you have any other questions right now, or would you like to take some time and call me if things come up?
Patient: I think I'll call if I think of anything, but I think I understand the plan. When would we schedule this?
Doctor: Given the findings, I'd like to move forward within the next couple of weeks. My office will call you with the date and all the preop instructions, including the bowel prep and when to stop your aspirin.
Patient: Okay, thank you for explaining all of this so clearly.
Doctor: Of course. We'll take good care of you through this.`,
  },
];
