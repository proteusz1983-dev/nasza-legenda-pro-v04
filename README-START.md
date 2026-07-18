# Nasza Legenda 0.5.1 — pierwszy filmowy fragment

To nie jest kolejna wersja tekstowej gry. Jest to pierwszy działający fragment silnika w kierunku **Bandersnatch**:

`scena filmowa → zadanie z czasem → wynik zadania → decyzja → natychmiastowy klip → konsekwencja`

## Co już działa

- pełnoekranowe klipy MP4 z dźwiękiem i napisami;
- konfiguracja grupy od 2 do 6 osób;
- wszystkie klipy są pobierane do pamięci przed rozpoczęciem;
- zadanie w prawdziwym pokoju z limitem 30 sekund;
- wpisanie lub podyktowanie znalezionego przedmiotu;
- rozpoznanie typu przedmiotu: odbiornik sygnału, zabezpieczenie, światło lub inny;
- przedmiot wskazuje korzystniejszy wybór;
- decyzja ma limit 10 sekund;
- brak decyzji powoduje automatyczny wybór zależny od wyniku zadania;
- dwie różne ścieżki filmowe;
- osobna konsekwencja przekroczenia czasu;
- cliffhanger;
- zapis przebiegu do JSON;
- historia jest oddzielona od silnika w pliku `story-graph.json` — fundament pod kolejne odcinki i marketplace.

## Uczciwe ograniczenie tej paczki

Klipy w tej wersji są **filmowym ruchem z wysokiej jakości grafiki koncepcyjnej**, zmontowanym z dźwiękiem i narracją. Pozwalają sprawdzić rytm i technikę przełączania historii, ale nie są jeszcze pełnymi scenami AI z naturalnym ruchem aktorów.

Kolejny krok polega na zastępowaniu plików w folderze:

`episodes/signal-spoza-czasu/scenes/`

prawdziwymi klipami wygenerowanymi w Kling. Silnik, zadanie, timer i rozgałęzienia pozostaną bez zmian.

## Uruchomienie na Windows

1. Rozpakuj ZIP.
2. Wejdź do folderu `nasza-legenda-0.5.1-cinematic`.
3. Kliknij dwukrotnie `START_LOCAL.bat`.
4. Nie zamykaj czarnego okna.
5. Otworzy się adres:

`http://localhost:8005`

Nie otwieraj samego `index.html`, ponieważ przeglądarka może wtedy zablokować pobieranie grafu historii i klipów.

## Aktualizacja GitHub Pages

1. Otwórz repozytorium `nasza-legenda-pro-v04`.
2. Wejdź w `Code` → `Add file` → `Upload files`.
3. Przeciągnij **całą zawartość** rozpakowanego folderu.
4. Folder `episodes` musi zostać wgrany razem z podfolderami i klipami MP4.
5. Kliknij `Commit changes`.
6. Poczekaj 2–5 minut.
7. Otwórz stronę w trybie incognito, aby ominąć pamięć starej aplikacji.

## Pierwszy test

Przejdź fragment sam na laptopie lub telefonie i sprawdź:

1. Czy słychać narrację od pierwszej sceny.
2. Czy po intro zadanie zaczyna się automatycznie.
3. Czy licznik ma 30 sekund.
4. Czy można wpisać albo podyktować przedmiot.
5. Czy po wybraniu `ODSŁUCHAJ` lub `ZABEZPIECZ` kolejny klip rusza bez ekranu ładowania.
6. Czy obie decyzje dają inne sceny.
7. Czy końcowy JSON zapisuje przedmiot, czas i drogę.

## Struktura odcinka

- `manifest.json` — dane odcinka;
- `story-graph.json` — graf scen, zadań i decyzji;
- `scenes/*.mp4` — klipy filmowe;
- `scenes-src/*.png` — obrazy zastępcze i plakaty scen.

Wersja: **0.5.1**
