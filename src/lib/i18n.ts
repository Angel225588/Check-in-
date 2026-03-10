export type Lang = "fr" | "en";

const translations = {
  // Upload page
  "upload.title": { fr: "Upload Petit-Déjeuner", en: "Breakfast Upload" },
  "upload.subtitle": { fr: "Uploader les rapports pour démarrer la session", en: "Upload daily reports to start the session" },
  "upload.clientList": { fr: "Liste Clients", en: "Client List" },
  "upload.clientListDesc": { fr: "Pages du rapport journalier", en: "Daily report pages" },
  "upload.vipList": { fr: "Liste VIP", en: "VIP List" },
  "upload.vipListDesc": { fr: "Optionnel, marquer les VIP", en: "Optional, tag VIPs" },
  "upload.startSession": { fr: "Démarrer la Session", en: "Start Session" },
  "upload.rooms": { fr: "chambres", en: "rooms" },
  "upload.pasteManually": { fr: "Coller les données manuellement", en: "Paste data manually" },
  "upload.pasteManuallyDesc": { fr: "Quand les photos ne marchent pas", en: "For when photos don't work" },
  "upload.pasteReportData": { fr: "Coller les données du rapport", en: "Paste Report Data" },
  "upload.close": { fr: "Fermer", en: "Close" },
  "upload.clear": { fr: "Effacer", en: "Clear" },
  "upload.checkin": { fr: "Check-in", en: "Check-in" },
  "upload.noDetect": { fr: "Impossible de détecter les chambres. Essayez une photo plus claire ou collez manuellement.", en: "Could not detect rooms. Try a clearer photo or paste manually." },
  "upload.showRawOcr": { fr: "Afficher le texte OCR brut", en: "Show raw OCR text" },
  "upload.goToCheckin": { fr: "Check-in", en: "Check-in" },

  // Search page
  "search.upload": { fr: "Upload", en: "Upload" },
  "search.noData": { fr: "Pas de données pour aujourd'hui", en: "No Data for Today" },
  "search.noDataDesc": { fr: "Uploadez le rapport journalier pour commencer le check-in.", en: "Upload the daily report to start checking in guests." },
  "search.uploadReport": { fr: "Uploader le Rapport", en: "Upload Report" },
  "search.roomPlaceholder": { fr: "Numéro de chambre...", en: "Type room number..." },
  "search.namePlaceholder": { fr: "Nom du client...", en: "Type guest name..." },
  "search.noRooms": { fr: "Aucune chambre trouvée", en: "No rooms found" },
  "search.noClients": { fr: "Aucun client dans cette catégorie", en: "No clients in this category" },
  "search.allClients": { fr: "Tous les Clients", en: "All Clients" },
  "search.entered": { fr: "Entrés", en: "Entered" },
  "search.remaining": { fr: "Restants", en: "Remaining" },
  "search.comp": { fr: "Comp", en: "Comp" },

  // Metrics
  "metrics.total": { fr: "Total", en: "Total" },
  "metrics.entered": { fr: "Entrés", en: "Entered" },
  "metrics.remaining": { fr: "Restants", en: "Remaining" },
  "metrics.comp": { fr: "Comp", en: "Comp" },

  // Suggestion card
  "card.remaining": { fr: "restants", en: "remaining" },

  // Check-in page
  "checkin.search": { fr: "Rechercher", en: "Search" },
  "checkin.room": { fr: "Chambre", en: "Room" },
  "checkin.progress": { fr: "Progression du check-in", en: "Check-in progress" },
  "checkin.adults": { fr: "Adultes", en: "Adults" },
  "checkin.children": { fr: "Enfants", en: "Children" },
  "checkin.total": { fr: "Total", en: "Total" },
  "checkin.arrival": { fr: "Arrivée", en: "Arrival" },
  "checkin.departure": { fr: "Départ", en: "Departure" },
  "checkin.package": { fr: "Forfait", en: "Package" },
  "checkin.remaining": { fr: "restants", en: "remaining" },
  "checkin.of": { fr: "sur", en: "of" },
  "checkin.allDone": { fr: "Tous enregistrés", en: "All Checked In" },
  "checkin.allDoneDesc": { fr: "Tous les {count} clients de cette chambre sont entrés.", en: "All {count} guests from this room have entered." },
  "checkin.button": { fr: "Enregistrer", en: "Check In" },
  "checkin.success": { fr: "Enregistré !", en: "Checked In!" },
  "checkin.guest": { fr: "client entré", en: "guest entered" },
  "checkin.guests": { fr: "clients entrés", en: "guests entered" },
  "checkin.toggleVip": { fr: "Marquer VIP", en: "Toggle VIP" },
  "checkin.addClient": { fr: "Ajouter un Client", en: "Add Client" },
  "checkin.addClientDesc": { fr: "Ajouter un client manquant", en: "Add a missing client" },
  "checkin.roomNumber": { fr: "N° Chambre", en: "Room Number" },
  "checkin.guestName": { fr: "Nom du client", en: "Guest Name" },
  "checkin.adultsCount": { fr: "Adultes", en: "Adults" },
  "checkin.childrenCount": { fr: "Enfants", en: "Children" },
  "checkin.save": { fr: "Sauvegarder", en: "Save" },
  "checkin.cancel": { fr: "Annuler", en: "Cancel" },

  // History
  "history.title": { fr: "Historique des Check-ins", en: "Check-in History" },
  "history.noCheckins": { fr: "Aucun check-in aujourd'hui", en: "No check-ins yet today" },
  "history.closeDay": { fr: "Clôturer & Voir le Rapport", en: "Close Day & View Report" },
  "history.pastSessions": { fr: "Sessions Passées", en: "Past Sessions" },
  "history.noSessions": { fr: "Aucune session passée", en: "No past sessions" },
  "history.session": { fr: "Session", en: "Session" },
  "history.closedAt": { fr: "Clôturée à", en: "Closed at" },
  "history.clientList": { fr: "Liste des Clients", en: "Client List" },
  "history.checkinLog": { fr: "Journal des Check-ins", en: "Check-in Log" },
  "history.rawData": { fr: "Données brutes uploadées", en: "Raw Uploaded Data" },

  // Dashboard
  "dash.title": { fr: "Tableau de Bord", en: "Dashboard" },
  "dash.today": { fr: "Aujourd'hui", en: "Today" },
  "dash.last7": { fr: "7 Jours", en: "Last 7 Days" },
  "dash.custom": { fr: "Période", en: "Custom" },
  "dash.snapshot": { fr: "Snapshot du jour", en: "Today's Snapshot" },
  "dash.expected": { fr: "Attendus", en: "Expected" },
  "dash.showedUp": { fr: "Présents", en: "Showed Up" },
  "dash.noShows": { fr: "Absents", en: "No-Shows" },
  "dash.compCost": { fr: "Coût Comp", en: "Comp Cost" },
  "dash.rushHours": { fr: "Heures de Pointe", en: "Rush Hours" },
  "dash.peak": { fr: "Heure de pointe", en: "Peak time" },
  "dash.trend": { fr: "Tendance", en: "Trend" },
  "dash.utilization": { fr: "Utilisation %", en: "Utilization %" },
  "dash.periodSummary": { fr: "Résumé Période", en: "Period Summary" },
  "dash.avgDaily": { fr: "Moy. Quotidienne", en: "Avg Daily" },
  "dash.guestsDay": { fr: "clients/jour", en: "guests/day" },
  "dash.guests": { fr: "clients", en: "guests" },
  "dash.days": { fr: "jours", en: "days" },
  "dash.noData": { fr: "Pas de données pour aujourd'hui.", en: "No data for today yet." },
  "dash.noHistory": { fr: "Pas encore de données historiques.", en: "No historical data yet. Data accumulates automatically." },
  "dash.costPerCover": { fr: "Coût/couvert", en: "Cost per cover" },
  "dash.save": { fr: "Sauver", en: "Save" },
  "dash.from": { fr: "Du", en: "From" },
  "dash.to": { fr: "Au", en: "To" },
  "dash.apply": { fr: "Appliquer", en: "Apply" },
  "dash.refresh": { fr: "Actualiser les Sessions", en: "Refresh Sessions" },
  "dash.refreshed": { fr: "Données actualisées", en: "Data refreshed" },

  // Report
  "report.title": { fr: "Rapport de Fin de Journée", en: "End of Day Report" },
  "report.totalRooms": { fr: "Total Chambres", en: "Total Rooms" },
  "report.totalGuests": { fr: "Total Personnes", en: "Total Guests" },
  "report.entered": { fr: "Entrés", en: "Entered" },
  "report.remaining": { fr: "Restants", en: "Remaining" },
  "report.noShows": { fr: "Absents", en: "No-Shows" },
  "report.vipRooms": { fr: "Chambres VIP", en: "VIP Rooms" },
  "report.compRooms": { fr: "Chambres Comp", en: "Comp Rooms" },
  "report.allIn": { fr: "Tous entrés", en: "All In" },
  "report.partial": { fr: "Partiel", en: "Partial" },
  "report.noShow": { fr: "Absent", en: "No Show" },
  "report.roomBreakdown": { fr: "Détail par Chambre", en: "Room Breakdown" },
  "report.timeline": { fr: "Chronologie des Check-ins", en: "Check-in Timeline" },
  "report.exportPdf": { fr: "Exporter PDF", en: "Export PDF" },
  "report.exportCsv": { fr: "Exporter CSV", en: "Export CSV" },
  "report.closeDay": { fr: "Clôturer la Journée", en: "Close Day & Start New" },
  "report.confirmClose": { fr: "La session sera archivée et les données effacées. Exportez le rapport d'abord.", en: "This will archive today's session and clear data. Export the report first." },
  "report.confirmYes": { fr: "Oui, Clôturer", en: "Yes, Close Day" },
  "report.back": { fr: "Rechercher", en: "Search" },
  "report.room": { fr: "Chambre", en: "Room" },
  "report.name": { fr: "Nom", en: "Name" },
  "report.inTotal": { fr: "Entrés/Total", en: "In/Total" },
  "report.status": { fr: "Statut", en: "Status" },
  "report.rawData": { fr: "Données OCR brutes", en: "Raw OCR Data" },

  // Scanner
  "scanner.holdStill": { fr: "Ne bougez pas...", en: "Hold still..." },
  "scanner.pointAt": { fr: "Visez le document", en: "Point at document" },
  "scanner.retake": { fr: "Reprendre", en: "Retake" },
  "scanner.use": { fr: "Utiliser", en: "Use Photo" },
  "scanner.openGallery": { fr: "Ouvrir la Galerie", en: "Open Gallery" },

  // Photo capture
  "photo.processing": { fr: "Traitement de", en: "Processing" },
  "photo.pages": { fr: "page(s)...", en: "page(s)..." },
  "photo.maxPages": { fr: "Maximum {max} pages atteint.", en: "Maximum {max} pages reached." },

  // CSV importer
  "csv.title": { fr: "Coller les données du rapport", en: "Paste Report Data" },
  "csv.desc": { fr: "Collez les données ci-dessous. Colonnes : N° Chambre, Type, RTC, N° Conf, Nom, Arrivée, Départ, Statut, Adultes, Enfants, Code Tarif, Forfait", en: "Paste the report data below. Columns: Room No, Room Type, RTC, Conf No, Name, Arrival, Departure, Status, Adults, Children, Rate Code, Package Code" },
  "csv.parse": { fr: "Analyser les Données", en: "Parse Data" },
  "csv.noRows": { fr: "Aucune ligne valide trouvée. Vérifiez que chaque ligne a au moins 8 colonnes séparées par des virgules, tabulations ou points-virgules.", en: "No valid rows found. Make sure each row has at least 8 columns separated by commas, tabs, or semicolons." },

  // Data table
  "table.review": { fr: "Vérifier les Données", en: "Review Data" },
  "table.confirm": { fr: "Confirmer & Sauvegarder", en: "Confirm & Save" },
  "table.room": { fr: "Chambre", en: "Room" },
  "table.name": { fr: "Nom", en: "Name" },
  "table.pkg": { fr: "Forfait", en: "Package" },
  // Verification
  "verify.title": { fr: "Vérification", en: "Verification" },
  "verify.totalClients": { fr: "Total clients", en: "Total clients" },
  "verify.totalGuests": { fr: "Total personnes", en: "Total guests" },
  "verify.sharedRooms": { fr: "Chambres partagées", en: "Shared rooms" },
  "verify.missingData": { fr: "Données manquantes", en: "Missing data" },
  "verify.noName": { fr: "sans nom", en: "no name" },
  "verify.noPackage": { fr: "sans forfait", en: "no package" },
  "verify.zeroGuests": { fr: "0 personnes", en: "0 guests" },
  "verify.allGood": { fr: "Tout est bon", en: "All good" },

  // Dashboard
  "upload.dashboard": { fr: "Dashboard", en: "Dashboard" },
  "upload.dashboardDesc": { fr: "Statistiques, tendances & coûts", en: "Stats, trends & costs" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = translations[key];
  let text: string = entry?.[lang] || entry?.["en"] || key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}
