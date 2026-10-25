<?php

function portalProviderExportRows(PDO $db, int $year): array {
    $end = min(sprintf('%04d-12-31 23:59:59', $year), portalNow());
    $start = sprintf('%04d-01-01 00:00:00', $year);
    $result = [];
    foreach (portalRows($db, 'SELECT * FROM providers WHERE created_at <= ? AND (closed_at IS NULL OR closed_at >= ?) ORDER BY id', [$end, $start]) as $provider) {
        $history = portalRow($db, 'SELECT * FROM provider_history WHERE provider_id = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1', [$provider['id'], $end]);
        $result[] = ['id' => (int)$provider['id'], 'created_at' => $provider['created_at'], 'as_of' => $end, 'status' => $history['status'] ?? 'unbekannt', 'profile' => $history ? portalDecode($history['profile_data']) : [], 'history_known' => (bool)$history];
    }
    return $result;
}

function portalProviderWorkbook(PDO $db, int $year): \PhpOffice\PhpSpreadsheet\Spreadsheet {
    $exportRows = portalProviderExportRows($db, $year);
    require_once __DIR__ . '/vendor/autoload.php';
    $book = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
    $book->removeSheetByIndex(0);
    $rows = [
        'Anbieter' => [['Träger-ID', 'Status', 'Eingetragener Name', 'Öffentlicher Name', 'Rechtsform', 'Straße', 'PLZ', 'Ort', 'Land', 'Kontakt', 'Öffentliche E-Mail', 'Website', 'USt-ID', 'Registerart', 'Registernummer', 'Grund fehlende Registerangabe', 'Grund fehlende Steuerkennung', 'EU-Ansässigkeiten', 'Finanzkontokennung (falls bekannt)', 'Abweichender Kontoinhaber', 'Weitere Kontoinhaberangaben', 'Registriert am', 'Datenstand', 'Historie bekannt']],
        'Steuerkennungen' => [['Träger-ID', 'Ausstellender EU-Staat', 'Steuerkennung']],
        'EU-Betriebsstätten' => [['Träger-ID', 'EU-Staat', 'Anschrift']],
        'Hinweise' => [['Eigenschaft', 'Wert'], ['Berichtsjahr', (string)$year], ['Erstellt am', portalNow()], ['Inhalt', 'Anbieterstammdaten. Alle im Berichtsjahr geführten Träger einschließlich inaktiver und gesperrter Organisationen.'], ['Finanzdaten', 'Zahlungen, Umsätze und Vergütungen werden in dieser Ausbaustufe nicht erfasst. Fehlende Finanzwerte sind keine Nullumsätze.'], ['PStTG', 'Diese Anbieterübersicht ist kein vollständiger PStTG-Meldedatensatz und ersetzt keine elektronische Meldung.'], ['Historie', 'Werte vor Einführung der Stammdatenhistorie sind unbekannt; es werden keine historischen Angaben erfunden.'], ['Jahresstand', 'Für abgeschlossene Jahre gilt der letzte bekannte Stand am Jahresende, für das laufende Jahr der Exportzeitpunkt.']],
    ];
    foreach ($exportRows as $provider) {
        $profile = $provider['profile'];
        $main = [$provider['id'], portalProviderStatusLabel($provider['status'])];
        foreach (['legal_name', 'public_name', 'legal_form', 'street', 'postal_code', 'city', 'country', 'contact_info', 'public_email', 'website', 'vat_id', 'register_type', 'register_number', 'missing_register_reason', 'missing_tax_reason'] as $field) $main[] = $profile[$field] ?? 'unbekannt';
        $main[] = implode(', ', $profile['residence_countries'] ?? []);
        foreach (['financial_account', 'account_holder', 'account_holder_details'] as $field) $main[] = $profile[$field] ?? '';
        array_push($main, $provider['created_at'], $provider['as_of'], $provider['history_known'] ? 'ja' : 'nein');
        $rows['Anbieter'][] = $main;
        foreach ($profile['tax_ids'] ?? [] as $tax) $rows['Steuerkennungen'][] = [$provider['id'], $tax['country'], $tax['number']];
        foreach ($profile['establishments'] ?? [] as $establishment) $rows['EU-Betriebsstätten'][] = [$provider['id'], $establishment['country'], $establishment['address']];
    }
    foreach ($rows as $title => $sheetRows) {
        $sheet = $book->createSheet(); $sheet->setTitle($title);
        foreach ($sheetRows as $rowIndex => $row) foreach ($row as $columnIndex => $value) {
            $coordinate = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($columnIndex + 1) . ($rowIndex + 1);
            $sheet->setCellValueExplicit($coordinate, (string)$value, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
        }
        $sheet->freezePane('A2');
        $sheet->getStyle('1:1')->getFont()->setBold(true);
        $sheet->setAutoFilter($sheet->calculateWorksheetDimension());
        foreach ($sheet->getColumnIterator() as $column) $sheet->getColumnDimension($column->getColumnIndex())->setWidth($title === 'Hinweise' ? 65 : 25);
    }
    $book->setActiveSheetIndex(0);
    return $book;
}
