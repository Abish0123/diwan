// Central registry of all supported school curricula.
// One curriculum is "active" at a time (saved in school_config MySQL table).
// All grade dropdowns, gradebook templates, and term structures read from here.

export type CurriculumId =
  | 'british' | 'american' | 'ib' | 'cbse' | 'qatar'
  | 'srilankan' | 'pakistani' | 'lebanese' | 'egyptian' | 'palestinian' | 'sudanese';
export type PeriodType   = 'term' | 'semester';

export interface GradebookCategory {
  name:    string;
  count:   number | null; // null = continuous / untracked
  marks:   number;        // marks allocated per period
  isExam:  boolean;
}

export interface GradebookBand {
  label:      string;             // e.g. "Primary (Grade 1 – 6)"
  grades:     string[];           // grades that belong to this band
  categories: GradebookCategory[];
  totalMarks: 100;
}

// Default subject template per grade band — the starting point a school sees
// the first time it sets (or switches) its curriculum. Schools can still add,
// remove, or rename subjects afterward from the Subjects page; this only
// seeds grades that don't already have a subject list, and never overwrites
// one a school has already customized (see getDefaultSubjectsForGrade below).
export interface SubjectBand {
  label:    string;
  grades:   string[];
  subjects: string[];
}

export interface AnnualStructure {
  periods:     number;      // 2 or 3
  periodType:  PeriodType;
  periodLabel: string;      // "Term" or "Semester"
  weights:     number[];    // must sum to 100, e.g. [30, 30, 40]
}

export interface CurriculumConfig {
  id:               CurriculumId;
  name:             string;
  shortName:        string;
  description:      string;
  accentColor:      string;       // hex for UI badges/highlights
  grades:           string[];     // complete ordered list, early-years first
  earlyYears:       string[];
  primary:          string[];
  middle:           string[];
  secondary:        string[];
  annualStructure:  AnnualStructure;
  gradebookBands:   GradebookBand[];
  subjectBands:     SubjectBand[];
  universalCategories: string[];  // all assessment category names used
}

// ── Qatar National Curriculum ────────────────────────────────────────────────

const QATAR: CurriculumConfig = {
  id:          'qatar',
  name:        'Qatar National Curriculum',
  shortName:   'Qatar',
  description: 'Ministry of Education & Higher Education, Qatar. Continuous assessment + term examinations, 3-term academic year.',
  accentColor: '#8B0000',
  grades:      ['Pre-KG','KG1','KG2','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  ['Pre-KG','KG1','KG2'],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
  middle:      ['Grade 7','Grade 8','Grade 9'],
  secondary:   ['Grade 10','Grade 11','Grade 12'],
  annualStructure: {
    periods:     3,
    periodType:  'term',
    periodLabel: 'Term',
    weights:     [30, 30, 40],
  },
  gradebookBands: [
    {
      label:  'Early Years (Pre-KG – KG2)',
      grades: ['Pre-KG','KG1','KG2'],
      categories: [
        { name:'Activities',           count:10,   marks:40, isExam:false },
        { name:'Observation Records',  count:4,    marks:20, isExam:false },
        { name:'Projects',             count:1,    marks:10, isExam:false },
        { name:'Participation',        count:null, marks:30, isExam:false },
      ],
      totalMarks: 100,
    },
    {
      label:  'Primary (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      categories: [
        { name:'Assignments',  count:5,    marks:15, isExam:false },
        { name:'Quizzes',      count:3,    marks:10, isExam:false },
        { name:'Projects',     count:1,    marks:10, isExam:false },
        { name:'Assessments',  count:3,    marks:20, isExam:false },
        { name:'Participation',count:null, marks:5,  isExam:false },
        { name:'Term Exam',    count:1,    marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Middle School (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      categories: [
        { name:'Assignments',  count:5,    marks:15, isExam:false },
        { name:'Quizzes',      count:4,    marks:10, isExam:false },
        { name:'Projects',     count:2,    marks:10, isExam:false },
        { name:'Assessments',  count:4,    marks:20, isExam:false },
        { name:'Participation',count:null, marks:5,  isExam:false },
        { name:'Term Exam',    count:1,    marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      categories: [
        { name:'Assignments',  count:4, marks:10, isExam:false },
        { name:'Projects',     count:2, marks:10, isExam:false },
        { name:'Assessments',  count:3, marks:20, isExam:false },
        { name:'Mock Exam',    count:1, marks:10, isExam:true  },
        { name:'Final Exam',   count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'KG (Pre-KG – KG2)',
      grades: ['Pre-KG','KG1','KG2'],
      subjects: ['Arabic','English','Mathematics','Science Discovery','Islamic Studies','Art','Physical Education'],
    },
    {
      label: 'Grade 1 – 6',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Grade 7 – 9',
      grades: ['Grade 7','Grade 8','Grade 9'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Qatar History','Art','Physical Education'],
    },
    {
      label: 'Grade 10 – 12',
      grades: ['Grade 10','Grade 11','Grade 12'],
      subjects: ['Arabic','English','Mathematics','Physics','Chemistry','Biology','ICT','Islamic Studies','Qatar History','Physical Education'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation','Behavior',
    'Mock Exam','Term Exam','Final Exam',
  ],
};

// ── British / Cambridge ──────────────────────────────────────────────────────

const BRITISH: CurriculumConfig = {
  id:          'british',
  name:        'British / Cambridge',
  shortName:   'British',
  description: 'Cambridge Assessment International Education. 3-term structure, Pre-Nursery to Year 13.',
  accentColor: '#003087',
  grades:      ['Pre-Nursery','Nursery','Reception','Year 1','Year 2','Year 3','Year 4','Year 5','Year 6','Year 7','Year 8','Year 9','Year 10','Year 11','Year 12','Year 13'],
  earlyYears:  ['Pre-Nursery','Nursery','Reception'],
  primary:     ['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'],
  middle:      ['Year 7','Year 8','Year 9'],
  secondary:   ['Year 10','Year 11','Year 12','Year 13'],
  annualStructure: {
    periods:     3,
    periodType:  'term',
    periodLabel: 'Term',
    weights:     [30, 30, 40],
  },
  gradebookBands: [
    {
      label:  'Early Years (Pre-Nursery – Reception)',
      grades: ['Pre-Nursery','Nursery','Reception'],
      categories: [
        { name:'Activities',             count:10, marks:40, isExam:false },
        { name:'Observation Assessments',count:4,  marks:20, isExam:false },
        { name:'Worksheets',             count:6,  marks:30, isExam:false },
        { name:'Project',                count:1,  marks:10, isExam:false },
      ],
      totalMarks: 100,
    },
    {
      label:  'All Years (Year 1 – 13)',
      grades: ['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6','Year 7','Year 8','Year 9','Year 10','Year 11','Year 12','Year 13'],
      categories: [
        { name:'Assignments',              count:4, marks:15, isExam:false },
        { name:'Quizzes',                  count:3, marks:10, isExam:false },
        { name:'Class Tests / Assessments',count:3, marks:20, isExam:false },
        { name:'Projects',                 count:1, marks:15, isExam:false },
        { name:'Term Exam',                count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'Early Years (Pre-Nursery – Reception)',
      grades: ['Pre-Nursery','Nursery','Reception'],
      subjects: ['English','Mathematics','Understanding the World','Personal Development','Creative Arts','Physical Development'],
    },
    {
      label: 'Cambridge Primary (Year 1 – 6)',
      grades: ['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'],
      subjects: ['English','Mathematics','Science','Digital Literacy','Computing','Global Perspectives','Art & Design','Music','Physical Education'],
    },
    {
      label: 'Lower Secondary (Year 7 – 9)',
      grades: ['Year 7','Year 8','Year 9'],
      subjects: ['English','Mathematics','Science','Global Perspectives','ICT','Geography','History','Art','Music','Physical Education','Foreign Language'],
    },
    {
      label: 'IGCSE (Year 10 – 11)',
      grades: ['Year 10','Year 11'],
      subjects: ['English','Mathematics','Biology','Chemistry','Physics','ICT','Business Studies','Accounting','Economics','Geography','History','Art & Design','Computer Science','French','Arabic'],
    },
    {
      label: 'AS / A Level (Year 12 – 13)',
      grades: ['Year 12','Year 13'],
      subjects: ['Mathematics','Physics','Chemistry','Biology','Accounting','Economics','Business','History','Geography','Psychology','Sociology'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation',
    'Mock Exam','Term Exam','Final Exam',
  ],
};

// ── American ─────────────────────────────────────────────────────────────────

const AMERICAN: CurriculumConfig = {
  id:          'american',
  name:        'American Curriculum',
  shortName:   'American',
  description: 'US-style curriculum with 2-semester structure, Pre-K through Grade 12.',
  accentColor: '#B22234',
  grades:      ['Pre-K','Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  ['Pre-K','Kindergarten'],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
  middle:      ['Grade 6','Grade 7','Grade 8'],
  secondary:   ['Grade 9','Grade 10','Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'semester',
    periodLabel: 'Semester',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Early Years (Pre-K – Kindergarten)',
      grades: ['Pre-K','Kindergarten'],
      categories: [
        { name:'Activities',             count:10, marks:40, isExam:false },
        { name:'Observation Assessments',count:4,  marks:20, isExam:false },
        { name:'Worksheets',             count:6,  marks:30, isExam:false },
        { name:'Project',                count:1,  marks:10, isExam:false },
      ],
      totalMarks: 100,
    },
    {
      label:  'All Grades (Grade 1 – 12)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
      categories: [
        { name:'Assignments',   count:6, marks:20, isExam:false },
        { name:'Quizzes',       count:5, marks:15, isExam:false },
        { name:'Projects',      count:2, marks:15, isExam:false },
        { name:'Mid-Term Exam', count:1, marks:20, isExam:true  },
        { name:'Final Exam',    count:1, marks:30, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'Pre-K – Grade 5',
      grades: ['Pre-K','Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
      subjects: ['English Language Arts','Mathematics','Science','Social Studies','Art','Music','Physical Education','Technology'],
    },
    {
      label: 'Grade 6 – 8',
      grades: ['Grade 6','Grade 7','Grade 8'],
      subjects: ['English','Mathematics','Science','Social Studies','Computer Science','Physical Education','Art'],
    },
    {
      label: 'Grade 9 – 12',
      grades: ['Grade 9','Grade 10','Grade 11','Grade 12'],
      subjects: ['English','Algebra / Advanced Mathematics','Biology','Chemistry','Physics','World History','US History','Government','Economics','Computer Science','Electives'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation',
    'Mid-Term Exam','Mock Exam','Final Exam',
  ],
};

// ── IB ───────────────────────────────────────────────────────────────────────

const IB: CurriculumConfig = {
  id:          'ib',
  name:        'IB Curriculum',
  shortName:   'IB',
  description: 'International Baccalaureate. 2-semester structure, Pre-K through Grade 12.',
  accentColor: '#0082C8',
  grades:      ['Pre-K','KG1','KG2','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  ['Pre-K','KG1','KG2'],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
  middle:      ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
  secondary:   ['Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'semester',
    periodLabel: 'Semester',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Early Years (Pre-K – KG2)',
      grades: ['Pre-K','KG1','KG2'],
      categories: [
        { name:'Activities',             count:10, marks:40, isExam:false },
        { name:'Observation Assessments',count:4,  marks:20, isExam:false },
        { name:'Worksheets',             count:6,  marks:30, isExam:false },
        { name:'Project',                count:1,  marks:10, isExam:false },
      ],
      totalMarks: 100,
    },
    {
      label:  'All Grades (Grade 1 – 12)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
      categories: [
        { name:'Assignments',              count:5, marks:15, isExam:false },
        { name:'Projects',                 count:2, marks:20, isExam:false },
        { name:'Presentations',            count:3, marks:10, isExam:false },
        { name:'Assessments',              count:3, marks:15, isExam:false },
        { name:'Internal Assessment (IA)', count:1, marks:10, isExam:false },
        { name:'Semester Exam',            count:1, marks:30, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'PYP (Pre-K – Grade 5)',
      grades: ['Pre-K','KG1','KG2','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
      subjects: ['Language','Mathematics','Science','Social Studies','Arts','Physical Education'],
    },
    {
      label: 'MYP (Grade 6 – 10)',
      grades: ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
      subjects: ['Language & Literature','Language Acquisition','Mathematics','Sciences','Individuals & Societies','Arts','Design','Physical Education'],
    },
    {
      label: 'DP (Grade 11 – 12)',
      grades: ['Grade 11','Grade 12'],
      subjects: ['Studies in Language & Literature','Language Acquisition','Mathematics','Sciences','Individuals & Societies','Arts','Theory of Knowledge','Extended Essay','CAS'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment','Internal Assessment (IA)',
    'Project','Presentation','Practical','Participation',
    'Mock Exam','Semester Exam','Final Exam',
  ],
};

// ── CBSE ─────────────────────────────────────────────────────────────────────

const CBSE: CurriculumConfig = {
  id:          'cbse',
  name:        'CBSE Curriculum',
  shortName:   'CBSE',
  description: 'Central Board of Secondary Education, India. 2-term structure, Pre-KG through Grade 12.',
  accentColor: '#FF6B35',
  grades:      ['Pre-KG','LKG','UKG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  ['Pre-KG','LKG','UKG'],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
  middle:      ['Grade 6','Grade 7','Grade 8'],
  secondary:   ['Grade 9','Grade 10','Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'term',
    periodLabel: 'Term',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Early Years (Pre-KG – UKG)',
      grades: ['Pre-KG','LKG','UKG'],
      categories: [
        { name:'Activities',             count:10, marks:40, isExam:false },
        { name:'Observation Assessments',count:4,  marks:20, isExam:false },
        { name:'Worksheets',             count:6,  marks:30, isExam:false },
        { name:'Project',                count:1,  marks:10, isExam:false },
      ],
      totalMarks: 100,
    },
    {
      label:  'Primary & Middle (Grade 1 – 8)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8'],
      categories: [
        { name:'Assignments',       count:3, marks:10, isExam:false },
        { name:'Periodic Tests',    count:3, marks:20, isExam:false },
        { name:'Projects',          count:1, marks:10, isExam:false },
        { name:'Subject Enrichment',count:1, marks:10, isExam:false },
        { name:'Term Exam',         count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary (Grade 9 – 10)',
      grades: ['Grade 9','Grade 10'],
      categories: [
        { name:'Periodic Tests',     count:null, marks:10, isExam:false },
        { name:'Notebook Submission',count:null, marks:5,  isExam:false },
        { name:'Subject Enrichment', count:null, marks:5,  isExam:false },
        { name:'Annual Exam',        count:1,    marks:80, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Senior Secondary (Grade 11 – 12)',
      grades: ['Grade 11','Grade 12'],
      categories: [
        { name:'Assignments',           count:3, marks:10, isExam:false },
        { name:'Unit Tests',            count:2, marks:10, isExam:false },
        { name:'Practicals / Projects', count:2, marks:20, isExam:false },
        { name:'Mid-Term Exam',         count:1, marks:20, isExam:true  },
        { name:'Final Exam',            count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'Pre-KG – UKG',
      grades: ['Pre-KG','LKG','UKG'],
      subjects: ['English','Hindi','Mathematics','EVS','Art','Physical Education'],
    },
    {
      label: 'Grade 1 – 5',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
      subjects: ['English','Hindi','Mathematics','EVS','General Knowledge','Computer Science','Art','Physical Education'],
    },
    {
      label: 'Grade 6 – 8',
      grades: ['Grade 6','Grade 7','Grade 8'],
      subjects: ['English','Hindi','Mathematics','Science','Social Science','Third Language','Computer Science','Art','Physical Education'],
    },
    {
      label: 'Grade 9 – 10',
      grades: ['Grade 9','Grade 10'],
      subjects: ['English','Mathematics','Science','Social Science','Second Language','Information Technology / AI','Physical Education'],
    },
    // Grade 11-12 defaults to the Science stream — CBSE splits into
    // Science/Commerce/Humanities at this stage, which is a per-student
    // elective choice a school makes manually, not something a single
    // default can represent. Schools switch this list from the Subjects
    // page once they know their stream mix.
    {
      label: 'Grade 11 – 12 (Science)',
      grades: ['Grade 11','Grade 12'],
      subjects: ['English','Physics','Chemistry','Mathematics','Biology / Computer Science','Physical Education'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Periodic Test','Class Test','Subject Enrichment',
    'Project','Notebook Submission','Practical','Participation',
    'Mid-Term Exam','Annual Exam','Final Exam',
  ],
};

// ── Sri Lankan ───────────────────────────────────────────────────────────────

const SRI_LANKAN: CurriculumConfig = {
  id:          'srilankan',
  name:        'Sri Lankan Curriculum',
  shortName:   'Sri Lankan',
  description: 'National curriculum of Sri Lanka (Grade 1–13). 3-term academic year with continuous assessment + term examinations. Default template — schools can edit during onboarding.',
  accentColor: '#8D153A',
  grades:      ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','Grade 13'],
  earlyYears:  [],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
  middle:      ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11'],
  secondary:   ['Grade 12','Grade 13'],
  annualStructure: {
    periods:     3,
    periodType:  'term',
    periodLabel: 'Term',
    weights:     [30, 30, 40],
  },
  gradebookBands: [
    {
      label:  'Primary (Grade 1 – 5)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
      categories: [
        { name:'Assignments', count:3, marks:15, isExam:false },
        { name:'Class Tests', count:3, marks:25, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Term Exam',   count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary (Grade 6 – 11)',
      grades: ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11'],
      categories: [
        { name:'Assignments', count:4, marks:15, isExam:false },
        { name:'Class Tests', count:4, marks:25, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Term Exam',   count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Collegiate (Grade 12 – 13)',
      grades: ['Grade 12','Grade 13'],
      categories: [
        { name:'Assignments', count:3, marks:10, isExam:false },
        { name:'Unit Tests',  count:3, marks:20, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Term Exam',   count:1, marks:60, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'Grade 1 – 5',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
      subjects: ['Sinhala / Tamil','English','Mathematics','Environmental Studies','Religion','Aesthetics'],
    },
    {
      label: 'Grade 6 – 11',
      grades: ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11'],
      subjects: ['First Language','English','Mathematics','Science','History','Geography','ICT','Health & Physical Education','Religion'],
    },
    {
      label: 'Grade 12 – 13',
      grades: ['Grade 12','Grade 13'],
      subjects: ['Science Stream','Commerce Stream','Arts Stream','Technology Stream'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Unit Test',
    'Project','Presentation','Practical','Participation','Term Exam','Final Exam',
  ],
};

// ── Pakistani ────────────────────────────────────────────────────────────────

const PAKISTANI: CurriculumConfig = {
  id:          'pakistani',
  name:        'Pakistani Curriculum',
  shortName:   'Pakistani',
  description: 'National curriculum of Pakistan (Grade 1–12). 2-term academic year. Default template — schools can edit during onboarding.',
  accentColor: '#01411C',
  grades:      ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  [],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
  middle:      ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
  secondary:   ['Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'term',
    periodLabel: 'Term',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Primary (Grade 1 – 5)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'],
      categories: [
        { name:'Assignments', count:3, marks:10, isExam:false },
        { name:'Unit Tests',  count:2, marks:20, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Term Exam',   count:1, marks:60, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Middle & Secondary (Grade 6 – 10)',
      grades: ['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
      categories: [
        { name:'Assignments', count:4, marks:10, isExam:false },
        { name:'Unit Tests',  count:3, marks:20, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Mid-Term',    count:1, marks:20, isExam:true  },
        { name:'Final Exam',  count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Higher Secondary (Grade 11 – 12)',
      grades: ['Grade 11','Grade 12'],
      categories: [
        { name:'Assignments', count:3, marks:10, isExam:false },
        { name:'Unit Tests',  count:2, marks:10, isExam:false },
        { name:'Practicals',  count:2, marks:20, isExam:false },
        { name:'Mid-Term',    count:1, marks:20, isExam:true  },
        { name:'Final Exam',  count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  subjectBands: [
    {
      label: 'Grade 1 – 8',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8'],
      subjects: ['English','Urdu','Mathematics','Science','Islamiat','Social Studies','Computer Science','Art'],
    },
    {
      label: 'Grade 9 – 12',
      grades: ['Grade 9','Grade 10','Grade 11','Grade 12'],
      subjects: ['English','Urdu','Mathematics','Physics','Chemistry','Biology','Pakistan Studies','Islamiat','Computer Science'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Unit Test',
    'Project','Practical','Participation','Mid-Term','Term Exam','Final Exam',
  ],
};

// ── Lebanese ─────────────────────────────────────────────────────────────────

const LEBANESE: CurriculumConfig = {
  id:          'lebanese',
  name:        'Lebanese Curriculum',
  shortName:   'Lebanese',
  description: 'National curriculum of Lebanon (Grade 1–12). 2-semester academic year. Default template — schools can edit during onboarding.',
  accentColor: '#C8102E',
  grades:      ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  [],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
  middle:      ['Grade 7','Grade 8','Grade 9'],
  secondary:   ['Grade 10','Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'semester',
    periodLabel: 'Semester',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Primary (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      categories: [
        { name:'Assignments',   count:4, marks:20, isExam:false },
        { name:'Quizzes',       count:3, marks:20, isExam:false },
        { name:'Project',       count:1, marks:10, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Intermediate (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      categories: [
        { name:'Assignments',   count:4, marks:15, isExam:false },
        { name:'Quizzes',       count:4, marks:20, isExam:false },
        { name:'Project',       count:1, marks:15, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      categories: [
        { name:'Assignments',   count:3, marks:10, isExam:false },
        { name:'Assessments',   count:3, marks:20, isExam:false },
        { name:'Project',       count:1, marks:10, isExam:false },
        { name:'Semester Exam', count:1, marks:60, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  // Generic Arabic-curriculum default (not individually specified) — same
  // shape as Qatar/Pakistani: core language + STEM progression, Islamic
  // Studies and ICT throughout, sciences split out at secondary level.
  subjectBands: [
    {
      label: 'Primary (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Intermediate (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      subjects: ['Arabic','English','Mathematics','Physics','Chemistry','Biology','Islamic Studies','ICT','Physical Education'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation','Semester Exam','Final Exam',
  ],
};

// ── Egyptian ─────────────────────────────────────────────────────────────────

const EGYPTIAN: CurriculumConfig = {
  id:          'egyptian',
  name:        'Egyptian Curriculum',
  shortName:   'Egyptian',
  description: 'National curriculum of Egypt (Grade 1–12). 2-semester academic year. Default template — schools can edit during onboarding.',
  accentColor: '#C09300',
  grades:      ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  [],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
  middle:      ['Grade 7','Grade 8','Grade 9'],
  secondary:   ['Grade 10','Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'semester',
    periodLabel: 'Semester',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Primary (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      categories: [
        { name:'Assignments',   count:4, marks:20, isExam:false },
        { name:'Quizzes',       count:3, marks:15, isExam:false },
        { name:'Project',       count:1, marks:15, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Preparatory (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      categories: [
        { name:'Assignments',   count:4, marks:15, isExam:false },
        { name:'Assessments',   count:3, marks:20, isExam:false },
        { name:'Project',       count:1, marks:15, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      categories: [
        { name:'Assignments', count:3, marks:10, isExam:false },
        { name:'Assessments', count:3, marks:20, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Mid-Term',    count:1, marks:20, isExam:true  },
        { name:'Final Exam',  count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  // Generic Arabic-curriculum default (not individually specified) — see
  // Lebanese comment above for the pattern this follows.
  subjectBands: [
    {
      label: 'Primary (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Preparatory (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      subjects: ['Arabic','English','Mathematics','Physics','Chemistry','Biology','Islamic Studies','ICT','Physical Education'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation','Mid-Term','Semester Exam','Final Exam',
  ],
};

// ── Palestinian ──────────────────────────────────────────────────────────────

const PALESTINIAN: CurriculumConfig = {
  id:          'palestinian',
  name:        'Palestinian Curriculum',
  shortName:   'Palestinian',
  description: 'National curriculum of Palestine (Grade 1–12). 2-semester academic year. Default template — schools can edit during onboarding.',
  accentColor: '#007A3D',
  grades:      ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  [],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4'],
  middle:      ['Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
  secondary:   ['Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'semester',
    periodLabel: 'Semester',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Lower Primary (Grade 1 – 4)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4'],
      categories: [
        { name:'Assignments',   count:4, marks:20, isExam:false },
        { name:'Quizzes',       count:3, marks:20, isExam:false },
        { name:'Project',       count:1, marks:10, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Basic Education (Grade 5 – 10)',
      grades: ['Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
      categories: [
        { name:'Assignments',   count:4, marks:15, isExam:false },
        { name:'Assessments',   count:3, marks:20, isExam:false },
        { name:'Project',       count:1, marks:15, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary / Tawjihi (Grade 11 – 12)',
      grades: ['Grade 11','Grade 12'],
      categories: [
        { name:'Assignments', count:3, marks:10, isExam:false },
        { name:'Assessments', count:3, marks:20, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Mid-Term',    count:1, marks:20, isExam:true  },
        { name:'Final Exam',  count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  // Generic Arabic-curriculum default (not individually specified) — see
  // Lebanese comment above for the pattern this follows.
  subjectBands: [
    {
      label: 'Lower Primary (Grade 1 – 4)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','Art','Physical Education'],
    },
    {
      label: 'Basic Education (Grade 5 – 10)',
      grades: ['Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Secondary / Tawjihi (Grade 11 – 12)',
      grades: ['Grade 11','Grade 12'],
      subjects: ['Arabic','English','Mathematics','Physics','Chemistry','Biology','Islamic Studies','ICT','Physical Education'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation','Mid-Term','Semester Exam','Final Exam',
  ],
};

// ── Sudanese ─────────────────────────────────────────────────────────────────

const SUDANESE: CurriculumConfig = {
  id:          'sudanese',
  name:        'Sudanese Curriculum',
  shortName:   'Sudanese',
  description: 'National curriculum of Sudan (Grade 1–12). 2-semester academic year. Default template — schools can edit during onboarding.',
  accentColor: '#D21034',
  grades:      ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'],
  earlyYears:  [],
  primary:     ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
  middle:      ['Grade 7','Grade 8','Grade 9'],
  secondary:   ['Grade 10','Grade 11','Grade 12'],
  annualStructure: {
    periods:     2,
    periodType:  'semester',
    periodLabel: 'Semester',
    weights:     [50, 50],
  },
  gradebookBands: [
    {
      label:  'Basic — Lower (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      categories: [
        { name:'Assignments',   count:4, marks:20, isExam:false },
        { name:'Class Tests',   count:3, marks:20, isExam:false },
        { name:'Project',       count:1, marks:10, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Basic — Upper (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      categories: [
        { name:'Assignments',   count:4, marks:15, isExam:false },
        { name:'Class Tests',   count:4, marks:25, isExam:false },
        { name:'Project',       count:1, marks:10, isExam:false },
        { name:'Semester Exam', count:1, marks:50, isExam:true  },
      ],
      totalMarks: 100,
    },
    {
      label:  'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      categories: [
        { name:'Assignments', count:3, marks:10, isExam:false },
        { name:'Assessments', count:3, marks:20, isExam:false },
        { name:'Project',     count:1, marks:10, isExam:false },
        { name:'Mid-Term',    count:1, marks:20, isExam:true  },
        { name:'Final Exam',  count:1, marks:40, isExam:true  },
      ],
      totalMarks: 100,
    },
  ],
  // Generic Arabic-curriculum default (not individually specified) — see
  // Lebanese comment above for the pattern this follows.
  subjectBands: [
    {
      label: 'Basic — Lower (Grade 1 – 6)',
      grades: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Basic — Upper (Grade 7 – 9)',
      grades: ['Grade 7','Grade 8','Grade 9'],
      subjects: ['Arabic','English','Mathematics','Science','Islamic Studies','Social Studies','ICT','Art','Physical Education'],
    },
    {
      label: 'Secondary (Grade 10 – 12)',
      grades: ['Grade 10','Grade 11','Grade 12'],
      subjects: ['Arabic','English','Mathematics','Physics','Chemistry','Biology','Islamic Studies','ICT','Physical Education'],
    },
  ],
  universalCategories: [
    'Assignment','Homework','Quiz','Class Test','Assessment',
    'Project','Presentation','Practical','Participation','Mid-Term','Semester Exam','Final Exam',
  ],
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const CURRICULA: Record<CurriculumId, CurriculumConfig> = {
  qatar:       QATAR,
  british:     BRITISH,
  american:    AMERICAN,
  ib:          IB,
  cbse:        CBSE,
  srilankan:   SRI_LANKAN,
  pakistani:   PAKISTANI,
  lebanese:    LEBANESE,
  egyptian:    EGYPTIAN,
  palestinian: PALESTINIAN,
  sudanese:    SUDANESE,
};

export const CURRICULUM_LIST: CurriculumConfig[] = Object.values(CURRICULA);

export const DEFAULT_CURRICULUM_ID: CurriculumId = 'qatar';

export function getCurriculum(id: string): CurriculumConfig {
  return CURRICULA[id as CurriculumId] ?? CURRICULA[DEFAULT_CURRICULUM_ID];
}

/** Return the gradebook band for a given grade within a curriculum. */
export function getBandForGrade(curriculum: CurriculumConfig, grade: string): GradebookBand | null {
  return curriculum.gradebookBands.find(b => b.grades.includes(grade)) ?? null;
}

/** Generate period labels: ["Term 1", "Term 2", "Term 3"] etc. */
export function getPeriodLabels(curriculum: CurriculumConfig): string[] {
  const { periodLabel, periods } = curriculum.annualStructure;
  return Array.from({ length: periods }, (_, i) => `${periodLabel} ${i + 1}`);
}

/** Default subject list for a grade under a curriculum — the starting point
 *  shown before a school customizes it. Empty array if the grade isn't in
 *  any of this curriculum's subject bands. */
export function getDefaultSubjectsForGrade(curriculum: CurriculumConfig, grade: string): string[] {
  return curriculum.subjectBands.find(b => b.grades.includes(grade))?.subjects ?? [];
}
