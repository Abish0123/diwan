// Real NCERT (CBSE) textbook chapter lists — the authoritative resource used
// to build CBSE curricula deterministically, instead of relying on an LLM that
// hallucinates chapter names and frequently 503s. Chapter lists follow the
// current rationalised NCERT syllabus. Source: official NCERT textbook portal
// (https://ncert.nic.in/textbook.php).
//
// NCERT reality the UI must respect: at Class 9 & 10 there is a single combined
// "Science" book (physics/chemistry/biology are NOT separate). Physics /
// Chemistry / Biology only exist as standalone NCERT books at Class 11 & 12.

export interface NcertBook {
  grade: string;    // matches the Grade dropdown value, e.g. "Grade 9"
  subject: string;  // matches the Subject dropdown value, e.g. "Science"
  code: string;     // NCERT book code (as used on ncert.nic.in)
  bookTitle: string;
  sourceUrl: string;
  chapters: string[];
}

export const NCERT_BOOKS: NcertBook[] = [
  // ── Class 9 ──────────────────────────────────────────────────────────────
  {
    grade: "Grade 9", subject: "Science", code: "iesc1",
    bookTitle: "Science — Class 9 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?iesc1=0-12",
    chapters: [
      "Matter in Our Surroundings",
      "Is Matter Around Us Pure?",
      "Atoms and Molecules",
      "Structure of the Atom",
      "The Fundamental Unit of Life",
      "Tissues",
      "Motion",
      "Force and Laws of Motion",
      "Gravitation",
      "Work and Energy",
      "Sound",
      "Improvement in Food Resources",
    ],
  },
  {
    grade: "Grade 9", subject: "Mathematics", code: "iemh1",
    bookTitle: "Mathematics — Class 9 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?iemh1=0-11",
    chapters: [
      "Number Systems",
      "Polynomials",
      "Coordinate Geometry",
      "Linear Equations in Two Variables",
      "Introduction to Euclid's Geometry",
      "Lines and Angles",
      "Triangles",
      "Quadrilaterals",
      "Circles",
      "Heron's Formula",
      "Surface Areas and Volumes",
      "Statistics",
    ],
  },

  // ── Class 10 ─────────────────────────────────────────────────────────────
  {
    grade: "Grade 10", subject: "Science", code: "jesc1",
    bookTitle: "Science — Class 10 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?jesc1=0-13",
    chapters: [
      "Chemical Reactions and Equations",
      "Acids, Bases and Salts",
      "Metals and Non-metals",
      "Carbon and its Compounds",
      "Life Processes",
      "Control and Coordination",
      "How do Organisms Reproduce?",
      "Heredity",
      "Light — Reflection and Refraction",
      "The Human Eye and the Colourful World",
      "Electricity",
      "Magnetic Effects of Electric Current",
      "Our Environment",
    ],
  },
  {
    grade: "Grade 10", subject: "Mathematics", code: "jemh1",
    bookTitle: "Mathematics — Class 10 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?jemh1=0-14",
    chapters: [
      "Real Numbers",
      "Polynomials",
      "Pair of Linear Equations in Two Variables",
      "Quadratic Equations",
      "Arithmetic Progressions",
      "Triangles",
      "Coordinate Geometry",
      "Introduction to Trigonometry",
      "Some Applications of Trigonometry",
      "Circles",
      "Areas Related to Circles",
      "Surface Areas and Volumes",
      "Statistics",
      "Probability",
    ],
  },

  // ── Class 11 ─────────────────────────────────────────────────────────────
  {
    grade: "Grade 11", subject: "Physics", code: "keph1",
    bookTitle: "Physics — Class 11 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?keph1=0-7",
    chapters: [
      "Units and Measurements",
      "Motion in a Straight Line",
      "Motion in a Plane",
      "Laws of Motion",
      "Work, Energy and Power",
      "System of Particles and Rotational Motion",
      "Gravitation",
      "Mechanical Properties of Solids",
      "Mechanical Properties of Fluids",
      "Thermal Properties of Matter",
      "Thermodynamics",
      "Kinetic Theory",
      "Oscillations",
      "Waves",
    ],
  },
  {
    grade: "Grade 11", subject: "Chemistry", code: "kech1",
    bookTitle: "Chemistry — Class 11 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?kech1=0-8",
    chapters: [
      "Some Basic Concepts of Chemistry",
      "Structure of Atom",
      "Classification of Elements and Periodicity in Properties",
      "Chemical Bonding and Molecular Structure",
      "Thermodynamics",
      "Equilibrium",
      "Redox Reactions",
      "Organic Chemistry — Some Basic Principles and Techniques",
      "Hydrocarbons",
    ],
  },
  {
    grade: "Grade 11", subject: "Biology", code: "kebo1",
    bookTitle: "Biology — Class 11 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?kebo1=0-18",
    chapters: [
      "The Living World",
      "Biological Classification",
      "Plant Kingdom",
      "Animal Kingdom",
      "Morphology of Flowering Plants",
      "Anatomy of Flowering Plants",
      "Structural Organisation in Animals",
      "Cell: The Unit of Life",
      "Biomolecules",
      "Cell Cycle and Cell Division",
      "Photosynthesis in Higher Plants",
      "Respiration in Plants",
      "Plant Growth and Development",
      "Breathing and Exchange of Gases",
      "Body Fluids and Circulation",
      "Excretory Products and their Elimination",
      "Locomotion and Movement",
      "Neural Control and Coordination",
      "Chemical Coordination and Integration",
    ],
  },
  {
    grade: "Grade 11", subject: "Mathematics", code: "kemh1",
    bookTitle: "Mathematics — Class 11 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?kemh1=0-13",
    chapters: [
      "Sets",
      "Relations and Functions",
      "Trigonometric Functions",
      "Complex Numbers and Quadratic Equations",
      "Linear Inequalities",
      "Permutations and Combinations",
      "Binomial Theorem",
      "Sequences and Series",
      "Straight Lines",
      "Conic Sections",
      "Introduction to Three Dimensional Geometry",
      "Limits and Derivatives",
      "Statistics",
      "Probability",
    ],
  },

  // ── Class 12 ─────────────────────────────────────────────────────────────
  {
    grade: "Grade 12", subject: "Physics", code: "leph1",
    bookTitle: "Physics — Class 12 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?leph1=0-7",
    chapters: [
      "Electric Charges and Fields",
      "Electrostatic Potential and Capacitance",
      "Current Electricity",
      "Moving Charges and Magnetism",
      "Magnetism and Matter",
      "Electromagnetic Induction",
      "Alternating Current",
      "Electromagnetic Waves",
      "Ray Optics and Optical Instruments",
      "Wave Optics",
      "Dual Nature of Radiation and Matter",
      "Atoms",
      "Nuclei",
      "Semiconductor Electronics: Materials, Devices and Simple Circuits",
    ],
  },
  {
    grade: "Grade 12", subject: "Chemistry", code: "lech1",
    bookTitle: "Chemistry — Class 12 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?lech1=0-9",
    chapters: [
      "Solutions",
      "Electrochemistry",
      "Chemical Kinetics",
      "The d- and f-Block Elements",
      "Coordination Compounds",
      "Haloalkanes and Haloarenes",
      "Alcohols, Phenols and Ethers",
      "Aldehydes, Ketones and Carboxylic Acids",
      "Amines",
      "Biomolecules",
    ],
  },
  {
    grade: "Grade 12", subject: "Biology", code: "lebo1",
    bookTitle: "Biology — Class 12 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?lebo1=0-12",
    chapters: [
      "Sexual Reproduction in Flowering Plants",
      "Human Reproduction",
      "Reproductive Health",
      "Principles of Inheritance and Variation",
      "Molecular Basis of Inheritance",
      "Evolution",
      "Human Health and Disease",
      "Microbes in Human Welfare",
      "Biotechnology: Principles and Processes",
      "Biotechnology and its Applications",
      "Organisms and Populations",
      "Ecosystem",
      "Biodiversity and Conservation",
    ],
  },
  {
    grade: "Grade 12", subject: "Mathematics", code: "lemh1",
    bookTitle: "Mathematics — Class 12 (NCERT)",
    sourceUrl: "https://ncert.nic.in/textbook.php?lemh1=0-13",
    chapters: [
      "Relations and Functions",
      "Inverse Trigonometric Functions",
      "Matrices",
      "Determinants",
      "Continuity and Differentiability",
      "Application of Derivatives",
      "Integrals",
      "Application of Integrals",
      "Differential Equations",
      "Vector Algebra",
      "Three Dimensional Geometry",
      "Linear Programming",
      "Probability",
    ],
  },
];

export function findNcertBook(grade?: string, subject?: string): NcertBook | undefined {
  if (!grade || !subject) return undefined;
  return NCERT_BOOKS.find(b => b.grade === grade && b.subject === subject);
}

// The subject options that have NCERT data for a given grade — used to guide
// the user (Science for 9/10; Physics/Chemistry/Biology for 11/12).
export function ncertSubjectsForGrade(grade?: string): string[] {
  if (!grade) return [];
  return NCERT_BOOKS.filter(b => b.grade === grade).map(b => b.subject);
}
