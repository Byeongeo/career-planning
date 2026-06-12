const APP_SECRET = ""; // Vercel의 APP_SECRET과 같은 값을 넣으세요. 비워두면 검사를 하지 않습니다.
const SHEET_ANALYSIS = "AI분석기록";
const SHEET_BOOK_CHOICES = "도서선택기록";

function doGet() {
  setupSheets_();
  return json_({
    ok: true,
    message: "진로 도서 추천 Vercel 저장 Webhook이 연결되었습니다."
  });
}

function doPost(e) {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    setupSheets_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (APP_SECRET && body.secret !== APP_SECRET) {
      return json_({ ok: false, error: "invalid secret" });
    }

    const action = String(body.action || "");
    if (action === "checkStudent") {
      return json_({
        ok: true,
        ...checkStudent_(normalizeStudent_(body.student))
      });
    }

    if (action === "analysis") {
      return json_(saveAnalysis_(body));
    }

    if (action === "bookChoice") {
      return json_(saveBookChoice_(body));
    }

    return json_({ ok: false, error: "unknown action" });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function setupSheets_() {
  ensureHeaders_(SHEET_ANALYSIS, [
    "접속 일시",
    "학년",
    "반",
    "번호",
    "이름",
    "학생키",
    "진로흥미검사 파일명",
    "직업적성검사 파일명",
    "진로개발역량검사 파일명",
    "AI 분석 요약",
    "상태"
  ]);

  ensureHeaders_(SHEET_BOOK_CHOICES, [
    "선택일시",
    "학년",
    "반",
    "번호",
    "이름",
    "도서명",
    "저자",
    "출판사",
    "출판연도",
    "정가",
    "판매가",
    "ISBN"
  ]);
}

function saveAnalysis_(body) {
  const student = normalizeStudent_(body.student);
  validateStudent_(student);

  const existing = checkStudent_(student);
  if (existing.analysisDone) {
    return { ok: true, blocked: true, message: existing.analysisMessage };
  }
  if (existing.bookChoiceDone) {
    return { ok: true, blocked: true, message: existing.bookChoiceMessage };
  }

  const analysis = body.analysis || {};
  const fileNames = body.fileNames || {};
  getSheet_(SHEET_ANALYSIS).appendRow([
    new Date(),
    student.grade,
    student.classNo,
    student.studentNo,
    student.name,
    makeStudentKey_(student),
    fileNames.interest || "",
    fileNames.aptitude || "",
    fileNames.competency || "",
    analysis.summaryForSheet || "",
    "completed"
  ]);

  return { ok: true };
}

function saveBookChoice_(body) {
  const student = normalizeStudent_(body.student);
  const book = normalizeBook_(body.book);
  validateStudent_(student);
  if (!book.title || !book.author || !book.publisher || !book.isbn) {
    throw new Error("선택한 도서 정보가 부족합니다.");
  }

  const existing = checkStudent_(student);
  if (existing.bookChoiceDone) {
    return { ok: true, blocked: true, message: existing.bookChoiceMessage };
  }

  getSheet_(SHEET_BOOK_CHOICES).appendRow([
    new Date(),
    student.grade,
    student.classNo,
    student.studentNo,
    student.name,
    book.title,
    book.author,
    book.publisher,
    book.pubYear,
    book.priceStandard,
    book.priceSales,
    book.isbn
  ]);

  return { ok: true };
}

function checkStudent_(student) {
  validateStudent_(student);
  const analysis = findAnalysis_(student);
  const bookChoice = findBookChoice_(student);
  return {
    analysisDone: Boolean(analysis),
    bookChoiceDone: Boolean(bookChoice),
    analysisMessage: analysis ? formatAlreadyAnalyzedMessage_(analysis.timestamp) : "",
    bookChoiceMessage: bookChoice ? formatAlreadyChoseBookMessage_(bookChoice) : ""
  };
}

function findAnalysis_(student) {
  const sheet = getSheet_(SHEET_ANALYSIS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const key = makeStudentKey_(student);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i += 1) {
    const row = values[i];
    if (String(row[5] || "") === key && String(row[10] || "") === "completed") {
      return { timestamp: row[0] };
    }
  }
  return null;
}

function findBookChoice_(student) {
  const sheet = getSheet_(SHEET_BOOK_CHOICES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const key = makeStudentKey_(student);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i += 1) {
    const row = values[i];
    const rowStudent = {
      grade: row[1],
      classNo: row[2],
      studentNo: row[3],
      name: row[4]
    };
    if (makeStudentKey_(rowStudent) === key) {
      return {
        timestamp: row[0],
        title: row[5],
        author: row[6]
      };
    }
  }
  return null;
}

function ensureHeaders_(sheetName, headers) {
  const sheet = getSheet_(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
}

function getSheet_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("구글 시트에서 확장 프로그램 > Apps Script로 열어 사용하세요.");
  }
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function normalizeStudent_(student) {
  student = student || {};
  return {
    grade: clean_(student.grade),
    classNo: clean_(student.classNo),
    studentNo: clean_(student.studentNo),
    name: clean_(student.name)
  };
}

function normalizeBook_(book) {
  book = book || {};
  return {
    title: clean_(book.title),
    author: clean_(book.author),
    publisher: clean_(book.publisher),
    pubYear: clean_(book.pubYear),
    priceStandard: Number(book.priceStandard || 0),
    priceSales: Number(book.priceSales || 0),
    isbn: clean_(book.isbn)
  };
}

function validateStudent_(student) {
  if (!student.grade || !student.classNo || !student.studentNo || !student.name) {
    throw new Error("학년, 반, 번호, 이름이 필요합니다.");
  }
}

function makeStudentKey_(student) {
  return [student.grade, student.classNo, student.studentNo, student.name]
    .map(function(value) {
      return clean_(value).replace(/\s+/g, "");
    })
    .join("|");
}

function formatAlreadyAnalyzedMessage_(timestamp) {
  const timeZone = Session.getScriptTimeZone() || "Asia/Seoul";
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return Utilities.formatDate(date, timeZone, "yyyy년 M월 d일 H시 m분 s초") + "에 이미 AI 분석을 완료했습니다. 같은 학생은 AI 분석을 한 번만 할 수 있습니다.";
}

function formatAlreadyChoseBookMessage_(choice) {
  const timeZone = Session.getScriptTimeZone() || "Asia/Seoul";
  const date = choice.timestamp instanceof Date ? choice.timestamp : new Date(choice.timestamp);
  const title = clean_(choice.title);
  const author = clean_(choice.author);
  const bookText = title ? " 선택한 도서: " + title + (author ? " / " + author : "") + "." : "";
  return Utilities.formatDate(date, timeZone, "yyyy년 M월 d일 H시 m분 s초") + "에 이미 도서 선택을 완료했습니다. 같은 학생은 도서 선택을 한 번만 할 수 있습니다." + bookText;
}

function clean_(value) {
  return String(value == null ? "" : value).trim();
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
