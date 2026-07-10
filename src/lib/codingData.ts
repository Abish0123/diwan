import { smartDb } from "@/lib/localDb";
import { CodingQuestion, CodingTest, CodingAttempt, SchoolClass } from "@/types/coding";

export const CODING_TESTS = "coding_tests";
export const CODING_QUESTIONS = "coding_questions";
export const CODING_ATTEMPTS = "coding_attempts";
export const QUESTION_BANKS = "question_banks";
export const ASSESSMENT_ASSIGNMENTS = "assessment_assignments";

const ALL_LANGS = ["javascript", "python", "java", "cpp", "csharp"] as const;

const jsStarter = (fn: string, hint: string) =>
  `// Implement ${fn}(input). 'input' is a string; return your answer.\n// ${hint}\nfunction ${fn}(input) {\n  \n}\n`;

const genericStarter = (fn: string) =>
  `# Implement ${fn} — read 'input' and return the answer.\n# (This language uses the server sandbox runner.)\n`;

function starterSet(fn: string, hint: string): CodingQuestion["starterCode"] {
  return {
    javascript: jsStarter(fn, hint),
    python: `def ${fn}(input):\n    # ${hint}\n    pass\n`,
    java: `class Solution {\n    String ${fn}(String input) {\n        // ${hint}\n        return "";\n    }\n}\n`,
    cpp: `#include <string>\nusing namespace std;\nstring ${fn}(string input) {\n    // ${hint}\n    return "";\n}\n`,
    csharp: `public class Solution {\n    public string ${fn}(string input) {\n        // ${hint}\n        return "";\n    }\n}\n`,
  };
}

export const SEED_QUESTIONS: CodingQuestion[] = [
  {
    id: "Q-SQUARE",
    title: "Square the Number",
    description:
      "Given an integer N on a single line, output the square of N (N × N).",
    difficulty: "Easy",
    category: "Math",
    marks: 20,
    timeLimitSec: 3,
    memoryMb: 256,
    languages: [...ALL_LANGS],
    functionName: "solution",
    constraints: "1 ≤ N ≤ 10^4",
    sampleInput: "5",
    sampleOutput: "25",
    starterCode: starterSet("solution", "return the square of the number"),
    testCases: [
      { id: "tc1", input: "5", expected: "25", hidden: false },
      { id: "tc2", input: "2", expected: "4", hidden: false },
      { id: "tc3", input: "100", expected: "10000", hidden: true },
      { id: "tc4", input: "9999", expected: "99980001", hidden: true },
      { id: "tc5", input: "1", expected: "1", hidden: true },
    ],
  },
  {
    id: "Q-REVERSE",
    title: "Reverse a String",
    description:
      "Given a string S, output the string reversed. The input has no leading/trailing spaces.",
    difficulty: "Easy",
    category: "Strings",
    marks: 25,
    timeLimitSec: 3,
    memoryMb: 256,
    languages: [...ALL_LANGS],
    functionName: "solution",
    constraints: "1 ≤ |S| ≤ 1000",
    sampleInput: "hello",
    sampleOutput: "olleh",
    starterCode: starterSet("solution", "return the reversed string"),
    testCases: [
      { id: "tc1", input: "hello", expected: "olleh", hidden: false },
      { id: "tc2", input: "abc", expected: "cba", hidden: false },
      { id: "tc3", input: "racecar", expected: "racecar", hidden: true },
      { id: "tc4", input: "StudentDiwan", expected: "nawiDtnedutS", hidden: true },
    ],
  },
  {
    id: "Q-SUMDIGITS",
    title: "Sum of Digits",
    description:
      "Given a non-negative integer N, output the sum of its digits.",
    difficulty: "Medium",
    category: "Math",
    marks: 30,
    timeLimitSec: 3,
    memoryMb: 256,
    languages: [...ALL_LANGS],
    functionName: "solution",
    constraints: "0 ≤ N ≤ 10^9",
    sampleInput: "1234",
    sampleOutput: "10",
    starterCode: starterSet("solution", "add up every digit of the number"),
    testCases: [
      { id: "tc1", input: "1234", expected: "10", hidden: false },
      { id: "tc2", input: "99", expected: "18", hidden: false },
      { id: "tc3", input: "1000000000", expected: "1", hidden: true },
      { id: "tc4", input: "0", expected: "0", hidden: true },
      { id: "tc5", input: "555555", expected: "30", hidden: true },
    ],
  },
];

export const SEED_TESTS: CodingTest[] = [
  {
    id: "TEST-PLACEMENT-1",
    title: "Campus Placement — Coding Round 1",
    description:
      "Entry-level coding screen covering fundamentals across math and strings.",
    instructions:
      "You have 60 minutes to solve all questions. Camera and full-screen are mandatory. Do not switch tabs or leave full-screen — every violation lowers your integrity score. Your code is auto-saved every 10 seconds.",
    durationMins: 60,
    totalMarks: 75,
    languages: [...ALL_LANGS],
    questionIds: ["Q-SQUARE", "Q-REVERSE", "Q-SUMDIGITS"],
    status: "Published",
    proctoringEnabled: true,
    createdAt: "2026-06-01T09:00:00.000Z",
  },
  {
    id: "TEST-DSA-BASICS",
    title: "Data Structures — Quick Diagnostic",
    description: "A short two-question diagnostic to gauge problem-solving basics.",
    instructions:
      "30 minutes, 2 questions. Proctoring is enabled. Read constraints carefully.",
    durationMins: 30,
    totalMarks: 45,
    languages: ["javascript", "python", "java"],
    questionIds: ["Q-REVERSE", "Q-SUMDIGITS"],
    status: "Published",
    proctoringEnabled: true,
    createdAt: "2026-06-10T09:00:00.000Z",
  },
];

// ─── Exam Question Bank ──────────────────────────────────────────────────────

const mcqBase = {
  difficulty: "Easy" as const, marks: 5, timeLimitSec: 60, memoryMb: 256,
  languages: [] as never[], functionName: "", constraints: "", sampleInput: "",
  sampleOutput: "", starterCode: {}, testCases: [], type: "mcq" as const,
};

export const EXAM_QUESTIONS: CodingQuestion[] = [
  // ── Document 2: ICT / IoT ──────────────────────────────────────────────────
  {
    ...mcqBase, id: "Q-ICT-1", category: "ICT", title: "Electronic Resources – Coverage",
    description: "One of the criteria for evaluating electronic resources that is the most difficult to apply due to the unlimited number of links:",
    options: ["A. Authority", "B. Purpose", "C. Coverage", "D. Accuracy and Validity"],
    correctOption: 2,
  },
  {
    ...mcqBase, id: "Q-ICT-2", category: "ICT", title: "Electronic Resources – Objectivity",
    description: "One of the criteria for evaluating electronic resources where a website should not be biased toward a particular idea or category of information:",
    options: ["A. Authority", "B. Objectivity", "C. Coverage", "D. Credibility"],
    correctOption: 1,
  },
  {
    ...mcqBase, id: "Q-ICT-3", category: "ICT", title: "Project Planning – Second Step",
    description: "The second step in planning, organizing, and designing a project:",
    options: [
      "A. Determine the number of document pages and the content of each page.",
      "B. Use a word processor to create and format the pages.",
      "C. Draw a layout on paper showing the distribution of topics and images.",
      "D. Think of a suitable title for the document.",
    ],
    correctOption: 0,
  },
  {
    ...mcqBase, id: "Q-ICT-4", category: "ICT", title: "Website – Cross-Platform Performance",
    description: "If a website works effectively across many operating systems and browsers, this indicates:",
    options: ["A. Security", "B. Accessibility", "C. Performance", "D. Functional Effectiveness"],
    correctOption: 3,
  },
  {
    ...mcqBase, id: "Q-ICT-5", category: "ICT", title: "Cloud Computing Definition",
    description: "The process of accessing data, programs, and storage locations through the Internet:",
    options: ["A. Internet of Things", "B. Cloud Computing", "C. Cloud Storage", "D. Smart Body Analyzer"],
    correctOption: 1,
  },
  {
    ...mcqBase, id: "Q-ICT-6", category: "ICT", title: "IoT Application – Transportation",
    description: "A personal IoT application used for automating roads, railways, and airports:",
    options: ["A. Smart Home", "B. Shopping", "C. Health and Fitness", "D. Transportation"],
    correctOption: 3,
  },
  {
    ...mcqBase, id: "Q-ICT-7", category: "ICT", title: "IoT Definition",
    description: "A network connecting smart electronic devices that exchange data through the Internet and can be controlled remotely:",
    options: ["A. Home Hub", "B. Internet of Things (IoT)", "C. Cloud Computing", "D. Cloud Storage"],
    correctOption: 1,
  },
  {
    ...mcqBase, id: "Q-ICT-8", category: "ICT", title: "IoT – Voice Command Application",
    description: "The most common IoT application that allows voice commands to control smart devices:",
    options: ["A. Smart Home", "B. Shopping", "C. Health and Fitness", "D. Transportation"],
    correctOption: 0,
  },
  // ── Document 2: Fill in the Blanks (as short answer) ──────────────────────
  {
    ...mcqBase, id: "Q-ICT-FB1", category: "ICT", title: "Fill in the Blank – Home Hub", type: "aptitude" as const,
    description: "__________________ helps connect all IoT devices together and acts as a control center for managing smart home devices.",
    sampleOutput: "Home Hub",
  },
  {
    ...mcqBase, id: "Q-ICT-FB2", category: "ICT", title: "Fill in the Blank – Health and Fitness", type: "aptitude" as const,
    description: "__________________ is a personal IoT application that helps record notes, read fitness data, and make decisions based on it.",
    sampleOutput: "Health and Fitness",
  },
  {
    ...mcqBase, id: "Q-ICT-FB3", category: "ICT", title: "Fill in the Blank – Cloud Storage", type: "aptitude" as const,
    description: "__________________ is the process of storing files such as documents, audio, and images on servers that can be accessed via the Internet.",
    sampleOutput: "Cloud Storage",
  },
  {
    ...mcqBase, id: "Q-ICT-FB4", category: "ICT", title: "Fill in the Blank – Performance", type: "aptitude" as const,
    description: "If a website loads quickly, it indicates compliance with the professional practice of __________________.",
    sampleOutput: "Performance",
  },
  {
    ...mcqBase, id: "Q-ICT-FB5", category: "ICT", title: "Fill in the Blank – .gov Domain", type: "aptitude" as const,
    description: "The domain extension __________________ indicates reliable information from a government institution.",
    sampleOutput: ".gov",
  },
  {
    ...mcqBase, id: "Q-ICT-FB6", category: "ICT", title: "Fill in the Blank – Currency Criterion", type: "aptitude" as const,
    description: "The website creation date and last update date are indicators of the __________________ criterion.",
    sampleOutput: "Currency (Timeliness)",
  },

  // ── Document 3: Lego Robotics ──────────────────────────────────────────────
  {
    ...mcqBase, id: "Q-ROBO-1", category: "Robotics", title: "Distance Sensor – Maximum Range",
    description: "The maximum distance that the distance sensor can detect an obstacle is:",
    options: ["A. 150 cm", "B. 180 cm", "C. 200 cm", "D. 250 cm"],
    correctOption: 2,
  },
  {
    ...mcqBase, id: "Q-ROBO-2", category: "Robotics", title: "Color Sensor – Number of Colors",
    description: "The number of colors that the color sensor can detect is:",
    options: ["A. 5 colors only", "B. 8 colors only", "C. 10 colors only", "D. All colors found in nature"],
    correctOption: 1,
  },
  {
    ...mcqBase, id: "Q-ROBO-3", category: "Robotics", title: "Force Sensor – Unit of Measurement",
    description: "The force sensor measures force in:",
    options: ["A. Centimeters", "B. Inches", "C. Hertz", "D. Newtons"],
    correctOption: 3,
  },
  {
    ...mcqBase, id: "Q-ROBO-4", category: "Robotics", title: "Obstacle Detection Sensor",
    description: "To detect an obstacle in front of the robot, we use:",
    options: ["A. Distance Sensor", "B. Motion Sensor", "C. Force Sensor", "D. Color Sensor"],
    correctOption: 0,
  },
  {
    ...mcqBase, id: "Q-ROBO-5", category: "Robotics", title: "Color Sensor – Purpose",
    description: "The color sensor is installed on the robot to:",
    options: [
      "A. Detect building obstacles",
      "B. Avoid collisions with other vehicles",
      "C. Recognize traffic light colors",
      "D. Detect collisions with objects",
    ],
    correctOption: 2,
  },
  {
    ...mcqBase, id: "Q-ROBO-6", category: "Robotics", title: "Variable – Purpose",
    description: "A variable is used to:",
    options: ["A. Store data in memory", "B. Detect colors", "C. Measure distance", "D. Turn the robot right"],
    correctOption: 0,
  },
  {
    ...mcqBase, id: "Q-ROBO-7", category: "Robotics", title: "Robot Hub Screen Size",
    description: "The robot Hub screen size is:",
    options: [
      "A. 2×2 LED Pixel Matrix",
      "B. 3×3 LED Pixel Matrix",
      "C. 4×4 LED Pixel Matrix",
      "D. 5×5 LED Pixel Matrix",
    ],
    correctOption: 3,
  },
  {
    ...mcqBase, id: "Q-ROBO-8", category: "Robotics", title: "Conditional Expression Result",
    description: "The result of the conditional expression 5 + 2 > 10 is:",
    options: ["A. 7", "B. 10", "C. True", "D. False"],
    correctOption: 3,
  },
  // ── Document 3: Fill in the Blanks ────────────────────────────────────────
  {
    ...mcqBase, id: "Q-ROBO-FB1", category: "Robotics", title: "Fill in the Blank – Sensors", type: "aptitude" as const,
    description: "__________________ enables the robot to collect information from its environment to make decisions.",
    sampleOutput: "Sensors",
  },
  {
    ...mcqBase, id: "Q-ROBO-FB2", category: "Robotics", title: "Fill in the Blank – No Color", type: "aptitude" as const,
    description: "If no color is detected, the color sensor displays __________________.",
    sampleOutput: "No Color",
  },
  {
    ...mcqBase, id: "Q-ROBO-FB3", category: "Robotics", title: "Fill in the Blank – Force Sensor", type: "aptitude" as const,
    description: "The __________________ sensor helps the robot measure collision intensity with other vehicles.",
    sampleOutput: "Force",
  },
  // ── Document 4: Microsoft Word ────────────────────────────────────────────
  {
    ...mcqBase, id: "Q-WORD-1", category: "Microsoft Word", title: "Word – Create a Citation",
    difficulty: "Medium" as const, marks: 5, type: "aptitude" as const,
    description: `Open the Word file named "National Day" on your desktop.\n\nCreate a citation for the title "Era of Sheikh Jassim" using the following details:\n• Website Name: Government\n• Month: 11\n• Year: 2025\n• URL: https://hukoomi.gov.qa/ar/qatar-national-day\n\nType DONE when you have completed this task.`,
    sampleOutput: "DONE",
  },
  {
    ...mcqBase, id: "Q-WORD-2", category: "Microsoft Word", title: "Word – Add a Footnote",
    difficulty: "Medium" as const, marks: 5, type: "aptitude" as const,
    description: `In the same "National Day" Word file, add the following footnote at the highlighted word "Founder":\n\n"Sheikh Jassim bin Mohammed Al Thani (May Allah have mercy on him)."\n\nType DONE when you have completed this task.`,
    sampleOutput: "DONE",
  },
  {
    ...mcqBase, id: "Q-WORD-3", category: "Microsoft Word", title: "Word – Change Footnote Numbering Format",
    difficulty: "Medium" as const, marks: 5, type: "aptitude" as const,
    description: `In the "National Day" Word file, change the footnote numbering format to:\n\nA, B, C\n\nSteps: References tab → Show Notes → Footnote & Endnote dialog → Number Format → select A, B, C → Apply.\n\nType DONE when you have completed this task.`,
    sampleOutput: "DONE",
  },
  {
    ...mcqBase, id: "Q-WORD-4", category: "Microsoft Word", title: "Word – Apply Heading Styles",
    difficulty: "Medium" as const, marks: 10, type: "aptitude" as const,
    description: `In the "National Day" Word file, apply the following heading styles:\n\n| Title | Style |\n|-------|-------|\n| Characteristics of Sheikh Jassim | Heading 1 |\n| Era of Sheikh Jassim | Heading 2 |\n| His Highness Sheikh Tamim | Heading 2 |\n\nSteps: Select the title text → Home tab → Styles group → click the correct Heading style.\n\nType DONE when you have completed this task.`,
    sampleOutput: "DONE",
  },
  {
    ...mcqBase, id: "Q-WORD-5", category: "Microsoft Word", title: "Word – Insert Table of Contents",
    difficulty: "Medium" as const, marks: 5, type: "aptitude" as const,
    description: `In the "National Day" Word file, insert a Table of Contents at the END of the document.\n\nSteps: Click at the end of the document → References tab → Table of Contents → choose Automatic Table 1.\n\nType DONE when you have completed this task.`,
    sampleOutput: "DONE",
  },
  {
    ...mcqBase, id: "Q-WORD-6", category: "Microsoft Word", title: "Word – Save Your Work",
    difficulty: "Easy" as const, marks: 5, type: "aptitude" as const,
    description: `Save the "National Day" Word file using your full name and class as the filename.\n\nExample filename: Ahmed_Al_Mansoori_Grade10A.docx\n\nType your saved filename below (e.g. YourName_Class.docx):`,
    sampleOutput: "YourName_Class.docx",
  },
  // ── Document 1: Lego Spike ────────────────────────────────────────────────
  {
    ...mcqBase, id: "Q-SPIKE-1", category: "Lego Spike", title: "Spike – Block 1: Motor Ports",
    difficulty: "Easy" as const, marks: 5, type: "aptitude" as const,
    description: `Open the Spike Lego application on your desktop and open the file "Question 1 – Safe Navigation".\n\nTask: Modify Block 1 so that the robot motors are assigned to ports C and F.\n\nWhich ports did you assign the motors to? Type your answer (e.g. C and F):`,
    sampleOutput: "C and F",
  },
  {
    ...mcqBase, id: "Q-SPIKE-2", category: "Lego Spike", title: "Spike – Block 2: Speed",
    difficulty: "Easy" as const, marks: 5, type: "aptitude" as const,
    description: `In the "Question 1 – Safe Navigation" file, modify Block 2 so that the robot moves at 60% speed.\n\nWhat speed percentage did you set? Type your answer:`,
    sampleOutput: "60",
  },
  {
    ...mcqBase, id: "Q-SPIKE-3", category: "Lego Spike", title: "Spike – Block 3: Obstacle Condition",
    difficulty: "Medium" as const, marks: 5, type: "aptitude" as const,
    description: `In the "Question 1 – Safe Navigation" file, add the appropriate condition in the If–Then–Else block (Block 3) so the robot makes a decision when it detects an obstacle at a distance of 20 cm.\n\nWhat condition did you set? Type your answer (e.g. distance < 20 cm):`,
    sampleOutput: "distance < 20 cm",
  },
  {
    ...mcqBase, id: "Q-SPIKE-4", category: "Lego Spike", title: "Spike – Block 4: Turn Left",
    difficulty: "Medium" as const, marks: 5, type: "aptitude" as const,
    description: `In the "Question 1 – Safe Navigation" file, adjust Block 4 so that the robot turns left by -60 degrees for one rotation when an obstacle is detected.\n\nWhat values did you set? Type: degrees and rotations (e.g. -60 degrees, 1 rotation):`,
    sampleOutput: "-60 degrees, 1 rotation",
  },
  {
    ...mcqBase, id: "Q-SPIKE-5", category: "Lego Spike", title: "Spike – Block 5: Color Detection",
    difficulty: "Easy" as const, marks: 5, type: "aptitude" as const,
    description: `In the "Question 1 – Safe Navigation" file, modify the condition in Block 5 so that the robot can detect the blue color.\n\nWhat color did you set the sensor to detect? Type your answer:`,
    sampleOutput: "Blue",
  },
  {
    ...mcqBase, id: "Q-SPIKE-6", category: "Lego Spike", title: "Spike – Block 6: Wait Time",
    difficulty: "Easy" as const, marks: 5, type: "aptitude" as const,
    description: `In the "Question 1 – Safe Navigation" file, modify Block 6 so that the robot waits for 3 seconds.\n\nHow many seconds did you set the wait block to? Type your answer:`,
    sampleOutput: "3",
  },
  // ── Document 4: Python Turtle ──────────────────────────────────────────────
  {
    ...mcqBase, id: "Q-PYTHON-TURTLE", category: "Python", title: "Python Turtle – Draw a Square",
    difficulty: "Medium" as const, marks: 20, timeLimitSec: 1800, type: "coding" as const,
    languages: ["python"] as never[],
    description: `Open Python and write a program using the turtle module:\n\n1. Set cursor size to 3\n2. Set cursor color to Blue\n3. Use a loop to draw a square with:\n   - Side length = 300\n   - Angle = 90°\n4. Display the text "it is square" on the drawing.\n\nSave your work using your name and class.`,
    functionName: "draw_square",
    starterCode: {
      python: `import turtle\n\nt = turtle.Turtle()\n# 1. Set cursor size to 3\n\n# 2. Set cursor color to Blue\n\n# 3. Use a loop to draw a square (side=300, angle=90)\n\n# 4. Display "it is square"\n\nturtle.done()\n`,
    } as never,
    testCases: [],
  },
];

export const EXAM_TESTS: CodingTest[] = [
  {
    id: "TEST-ICT-IOT",
    title: "ICT & Internet of Things Exam",
    description: "Covers evaluation of electronic resources, IoT applications, cloud computing, and smart devices.",
    instructions: "Read each question carefully. For MCQ select the best answer. For fill-in-the-blank type the exact missing word. You have 45 minutes.",
    durationMins: 45,
    totalMarks: 70,
    languages: [],
    questionIds: ["Q-ICT-1","Q-ICT-2","Q-ICT-3","Q-ICT-4","Q-ICT-5","Q-ICT-6","Q-ICT-7","Q-ICT-8","Q-ICT-FB1","Q-ICT-FB2","Q-ICT-FB3","Q-ICT-FB4","Q-ICT-FB5","Q-ICT-FB6"],
    status: "Published",
    proctoringEnabled: false,
    createdAt: "2026-06-20T09:00:00.000Z",
  },
  {
    id: "TEST-LEGO-ROBOTICS",
    title: "Lego Robotics Theory Exam",
    description: "Tests knowledge of robot sensors, variables, loops, and programming logic.",
    instructions: "Read each question carefully. For MCQ select the best answer. For fill-in-the-blank type the exact missing word. You have 40 minutes.",
    durationMins: 40,
    totalMarks: 55,
    languages: [],
    questionIds: ["Q-ROBO-1","Q-ROBO-2","Q-ROBO-3","Q-ROBO-4","Q-ROBO-5","Q-ROBO-6","Q-ROBO-7","Q-ROBO-8","Q-ROBO-FB1","Q-ROBO-FB2","Q-ROBO-FB3"],
    status: "Published",
    proctoringEnabled: false,
    createdAt: "2026-06-20T09:00:00.000Z",
  },
  {
    id: "TEST-WORD-NATIONAL-DAY",
    title: "Microsoft Word Practical – National Day",
    description: "Open the National Day Word file on your desktop and complete all 6 tasks: citation, footnote, numbering format, heading styles, Table of Contents, and save.",
    instructions: "Complete each task in Microsoft Word on your desktop. For each question, type DONE (or your answer) and click Next. Your teacher will verify your Word file after the exam. You have 30 minutes.",
    durationMins: 30,
    totalMarks: 35,
    languages: [],
    questionIds: ["Q-WORD-1","Q-WORD-2","Q-WORD-3","Q-WORD-4","Q-WORD-5","Q-WORD-6"],
    status: "Published",
    proctoringEnabled: false,
    createdAt: "2026-06-20T09:00:00.000Z",
  },
  {
    id: "TEST-LEGO-SPIKE",
    title: "Lego Spike Programming Exam – Safe Navigation",
    description: "Open the Spike Lego app and complete all 6 programming blocks for the Safe Navigation project.",
    instructions: "Open the Spike Lego application on your desktop and open 'Question 1 – Safe Navigation'. Complete each block task and type your answer in the system. You have 40 minutes.",
    durationMins: 40,
    totalMarks: 30,
    languages: [],
    questionIds: ["Q-SPIKE-1","Q-SPIKE-2","Q-SPIKE-3","Q-SPIKE-4","Q-SPIKE-5","Q-SPIKE-6"],
    status: "Published",
    proctoringEnabled: false,
    createdAt: "2026-06-20T09:00:00.000Z",
  },
  {
    id: "TEST-PYTHON-TURTLE",
    title: "Python Turtle Graphics Exam",
    description: "Practical Python exam — draw a square using the turtle module with specific properties.",
    instructions: "Write your Python code in the editor. Your program must draw a square with side 300, cursor color blue, cursor size 3, and display the text 'it is square'. You have 30 minutes.",
    durationMins: 30,
    totalMarks: 20,
    languages: ["python"],
    questionIds: ["Q-PYTHON-TURTLE"],
    status: "Published",
    proctoringEnabled: true,
    createdAt: "2026-06-20T09:00:00.000Z",
  },
];

/** Seeds questions + tests once (only if the tables are empty). */
export async function ensureCodingSeed(): Promise<void> {
  try {
    const [tests, questions] = await Promise.all([
      smartDb.getAll(CODING_TESTS) as Promise<CodingTest[]>,
      smartDb.getAll(CODING_QUESTIONS) as Promise<CodingQuestion[]>,
    ]);
    if (!questions || questions.length === 0) {
      await Promise.all(SEED_QUESTIONS.map((q) => smartDb.create(CODING_QUESTIONS, q as never, q.id)));
    }
    if (!tests || tests.length === 0) {
      await Promise.all(SEED_TESTS.map((t) => smartDb.create(CODING_TESTS, t as never, t.id)));
    }
    // Always upsert exam questions/tests (safe — uses question ID as key)
    await ensureExamSeed();
  } catch (e) {
    console.error("Coding seed failed:", e);
  }
}

/** Upserts the exam questions and tests regardless of existing data. */
export async function ensureExamSeed(): Promise<void> {
  try {
    const [existingQ, existingT] = await Promise.all([
      smartDb.getAll(CODING_QUESTIONS) as Promise<CodingQuestion[]>,
      smartDb.getAll(CODING_TESTS) as Promise<CodingTest[]>,
    ]);
    const existingQIds = new Set((existingQ || []).map((q) => q.id));
    const existingTIds = new Set((existingT || []).map((t) => t.id));

    await Promise.all([
      ...EXAM_QUESTIONS.filter((q) => !existingQIds.has(q.id))
        .map((q) => smartDb.create(CODING_QUESTIONS, q as never, q.id)),
      ...EXAM_TESTS.filter((t) => !existingTIds.has(t.id))
        .map((t) => smartDb.create(CODING_TESTS, t as never, t.id)),
    ]);
  } catch (e) {
    console.error("Exam seed failed:", e);
  }
}

export const getTests = () => smartDb.getAll(CODING_TESTS) as Promise<CodingTest[]>;
export const getQuestions = () => smartDb.getAll(CODING_QUESTIONS) as Promise<CodingQuestion[]>;
export const getAttempts = () => smartDb.getAll(CODING_ATTEMPTS) as Promise<CodingAttempt[]>;
export const getBanks = () => smartDb.getAll(QUESTION_BANKS) as Promise<import("@/types/coding").QuestionBank[]>;
export const getAssignments = () => smartDb.getAll(ASSESSMENT_ASSIGNMENTS) as Promise<import("@/types/coding").AssessmentAssignment[]>;
/** Real enrolled students from the main app (used to show class coverage). */
export const getEnrolledStudents = () => smartDb.getAll("students") as Promise<Record<string, unknown>[]>;

const normGrade = (g: string) => (g || "").toString().replace(/^grade\s*/i, "").trim();
const normSection = (s: string) => (s || "").toString().replace(/^section\s*/i, "").trim().toUpperCase();

/**
 * The real academic structure the coding module targets — derived live from
 * actually-enrolled students (the same `grade`/`section` fields every other
 * module in this app reads), instead of a separately-managed, previously-
 * fake-seeded "coding_classes" table tied to a fictional institution. There
 * is exactly one school here, so there is exactly one class list: whatever
 * grade/section combinations its real students are actually in.
 */
export async function getRealClasses(): Promise<SchoolClass[]> {
  const students = await getEnrolledStudents();
  const byKey = new Map<string, SchoolClass>();
  for (const s of students) {
    const grade = normGrade(String((s as { grade?: string }).grade || ""));
    const section = normSection(String((s as { section?: string }).section || ""));
    if (!grade || !section) continue; // skip students with incomplete class data
    const key = `${grade}-${section}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.studentCount = (existing.studentCount || 0) + 1;
    } else {
      byKey.set(key, { id: key, grade, section, studentCount: 1 });
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.section.localeCompare(b.section)
  );
}
