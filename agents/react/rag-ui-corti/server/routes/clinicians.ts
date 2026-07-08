import { Router } from "express";
import { CLINICIANS, clinicianProfile } from "../directory.js";
import { setClinician } from "../session.js";

const router = Router();

// Clinician directory for the sign-in picker: id/name/role only, no panels.
router.get("/clinicians", (_req, res) => {
  res.json(CLINICIANS.map(({ id, name, role }) => ({ id, name, role })));
});

// Clinician sign-in: records the active clinician and returns their profile
// including the resolved patient panel.
router.post("/clinician/login", (req, res) => {
  const { clinicianId } = req.body ?? {};
  const clinician = CLINICIANS.find((candidate) => candidate.id === clinicianId);
  if (!clinician) {
    res.status(400).json({ error: `Unknown clinician: ${clinicianId}` });
    return;
  }
  setClinician(clinician);
  console.log(`[clinician] signed in: ${clinician.name} (panel: ${clinician.patients.join(", ")})`);
  res.json(clinicianProfile(clinician));
});

export default router;
