import { describe, it, expect } from "vitest";
import { parseCSV, parseOCRText } from "@/lib/parser";

describe("parseCSV", () => {
  it("parses a valid CSV row with all fields", () => {
    const csv = `Room No,Room Type,RTC,Conf,Name,Arrival,Departure,Status,Adults,Children,Rate,Package
101,DLXK,A,123456,John Smith,05/03/26,07/03/26,CKIN,2,1,RACK,BKF GRP`;
    const clients = parseCSV(csv);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("101");
    expect(clients[0].name).toBe("John Smith");
    expect(clients[0].reservationStatus).toBe("CKIN");
    expect(clients[0].adults).toBe(2);
    expect(clients[0].children).toBe(1);
  });

  it("parses tab-separated values", () => {
    const tsv = "201\tPRMK\tB\t789012\tJane Doe\t01/03/26\t04/03/26\tDUOT\t1\t0\tBAR\tBKF INC";
    const clients = parseCSV(tsv);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("201");
    expect(clients[0].roomType).toBe("PRMK");
  });

  it("parses semicolon-separated values", () => {
    const ssv = "301;STHT;C;111111;Bob Lee;02/03/26;05/03/26;COUT;2;0;DISC;";
    const clients = parseCSV(ssv);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("301");
  });

  it("skips header rows", () => {
    const csv = `Room No,Room Type,RTC,Conf,Name,Arrival,Departure,Status,Adults,Children,Rate,Package
Room,Type,RTC,Conf,Name,Arrival,Departure,Status,Adults,Children,Rate,Package
101,DLXK,A,123456,Test Guest,05/03/26,07/03/26,CKIN,2,1,RACK,BKF`;
    const clients = parseCSV(csv);
    expect(clients).toHaveLength(1);
  });

  it("skips rows with fewer than 8 columns", () => {
    const csv = "101,DLXK,A,123";
    const clients = parseCSV(csv);
    expect(clients).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(parseCSV("")).toHaveLength(0);
    expect(parseCSV("   ")).toHaveLength(0);
  });

  it("handles missing optional fields gracefully", () => {
    const csv = "101,DLXK,,123456,Test,05/03/26,07/03/26,CKIN,,,";
    const clients = parseCSV(csv);
    expect(clients).toHaveLength(1);
    expect(clients[0].rtc).toBe("");
    expect(clients[0].adults).toBe(0);
    expect(clients[0].children).toBe(0);
  });

  it("parses multiple rows", () => {
    const csv = `101,DLXK,A,111,Guest One,01/03/26,03/03/26,CKIN,2,0,RACK,BKF
202,PRMK,B,222,Guest Two,02/03/26,04/03/26,DUOT,1,1,BAR,
303,STHT,C,333,Guest Three,03/03/26,05/03/26,COUT,3,2,DISC,BKF GRP`;
    const clients = parseCSV(csv);
    expect(clients).toHaveLength(3);
    expect(clients[0].roomNumber).toBe("101");
    expect(clients[1].roomNumber).toBe("202");
    expect(clients[2].roomNumber).toBe("303");
  });

  it("skips rows without a room number", () => {
    const csv = ",DLXK,A,123456,Test,05/03/26,07/03/26,CKIN,2,1,RACK,BKF";
    const clients = parseCSV(csv);
    expect(clients).toHaveLength(0);
  });
});

describe("parseOCRText", () => {
  it("extracts a room from OCR-style text", () => {
    const text = "101  DLXK  A  123456  John Smith  05/03/26  07/03/26  CKIN  2  1  RACK  BKF GRP";
    const clients = parseOCRText(text);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("101");
    expect(clients[0].reservationStatus).toBe("CKIN");
  });

  it("skips header lines", () => {
    const text = `Package Forecast
Room No  Room Type  RTC  Conf  Name  Arrival  Departure  Resv  Adl  Chl  Rate  Package
101  DLXK  A  123456  Test  05/03/26  07/03/26  CKIN  2  1  RACK  BKF`;
    const clients = parseOCRText(text);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("101");
  });

  it("handles empty text", () => {
    expect(parseOCRText("")).toHaveLength(0);
  });

  it("extracts dates correctly", () => {
    const text = "205  PRMK  B  999999  Jane Doe  15/03/26  18/03/26  DUOT  1  0";
    const clients = parseOCRText(text);
    expect(clients).toHaveLength(1);
    expect(clients[0].arrivalDate).toBe("15/03/26");
    expect(clients[0].departureDate).toBe("18/03/26");
  });

  it("handles lines without room numbers", () => {
    const text = `Some random text
Not a room line
101  DLXK  A  123456  Test  05/03/26  07/03/26  CKIN  2  1`;
    const clients = parseOCRText(text);
    expect(clients).toHaveLength(1);
  });

  it("parses multiple rooms from OCR text", () => {
    const text = `101  DLXK  123456  Guest One  01/03/26  03/03/26  CKIN  2  0
202  PRMK  789012  Guest Two  02/03/26  04/03/26  DUOT  1  1
303  STHT  345678  Guest Three  03/03/26  05/03/26  COUT  3  2`;
    const clients = parseOCRText(text);
    expect(clients).toHaveLength(3);
  });
});
