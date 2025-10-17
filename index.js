const axios = require("axios");

// Your API key
const API_KEY = "ak_3a8ad0e567fde922cc93e2f1aabcdbe256b8b23dfa3a6927";

// Base URL
const BASE_URL = "https://assessment.ksensetech.com/api/patients";


// wait X milliseconds
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Function to fetch a single page with retry
async function fetchPage(page = 1, limit = 5, retries = 3) {
  try {
    const response = await axios.get(BASE_URL, {
      headers: { "x-api-key": API_KEY },
      params: { page, limit },
    });
     await delay(500);
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying page ${page} in 1 second...`);

      await delay(1000);
      return fetchPage(page, limit, retries - 1);
    } else {
      console.error(`Failed to fetch page ${page}:`, error.message);
      return null;
    }
  }
}

// Function to fetch all patients
async function fetchAllPatients() {
  let allPatients = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await fetchPage(page, 20, 5); //
    if (!data) break;

    allPatients = allPatients.concat(data.data);
    totalPages = data.pagination ? data.pagination.totalPages : 1;
    page++;
    await delay(500); // Small delay to avoid hitting rate limits
  } while (page <= totalPages);

  console.log(`Fetched ${allPatients.length} patients`);
  return allPatients;
}

// --- RISK SCORING FUNCTIONS ---
function calculateBPRisk(bp) {
  if (!bp || typeof bp !== "string") return 0;
  const parts = bp.split("/").map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return 0;
  const [systolic, diastolic] = parts;
  let systolicRisk = 0;
  if (systolic < 120) systolicRisk = 1;
  else if (systolic >= 120 && systolic <= 129) systolicRisk = 2;
  else if (systolic >= 130 && systolic <= 139) systolicRisk = 3;
  else if (systolic >= 140) systolicRisk = 4;
   let diastolicRisk = 0;
  if (diastolic < 80) diastolicRisk = 1;
  else if (diastolic >= 80 && diastolic <= 89) diastolicRisk = 3;
  else if (diastolic >= 90) diastolicRisk = 4;

  return Math.max(systolicRisk, diastolicRisk);
}


function calculateTempRisk(temp) {
  if (temp === null || temp === undefined || isNaN(Number(temp))) return 0;
  const t = Number(temp);
  if (t <= 99.5) return 0;
  if (t >= 99.6 && t <= 100.9) return 1;
  if (t >= 101) return 2;
  return 0;
}

function calculateAgeRisk(age) {
  if (age === null || age === undefined || isNaN(Number(age))) return 0;
  const a = Number(age);
  if (a < 40) return 1;
  if (a >= 40 && a <= 65) return 1;
  if (a > 65) return 2;
  return 0;
}

// --- PROCESS AND SUBMIT ---
async function processAndSubmit() {
  const patients = await fetchAllPatients();

  const high_risk_patients = [];
  const fever_patients = [];
  const data_quality_issues = [];

  patients.forEach((p) => {
    const bpScore = calculateBPRisk(p.blood_pressure);
    const tempScore = calculateTempRisk(p.temperature);
    const ageScore = calculateAgeRisk(p.age);
    const totalRisk = bpScore + tempScore + ageScore;

    // High-risk patients
    if (totalRisk >= 4) high_risk_patients.push(p.patient_id);

    // Fever patients
    if (!isNaN(Number(p.temperature)) && Number(p.temperature) >= 99.6)
      fever_patients.push(p.patient_id);

    // Data quality issues
    if (
      bpScore === 0 ||
      tempScore === 0 ||
      ageScore === 0
    ) {
      data_quality_issues.push(p.patient_id);
    }
  });

  console.log("High-risk:", high_risk_patients);
  console.log("Fever:", fever_patients);
  console.log("Data issues:", data_quality_issues);

  // Submit to API
  try {
    const response = await axios.post(
      "https://assessment.ksensetech.com/api/submit-assessment",
      {
        high_risk_patients,
        fever_patients,
        data_quality_issues,
      },
      {
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Submission response:", response.data);
  } catch (err) {
    console.error("Submission failed:", err.message);
  }
}

processAndSubmit();