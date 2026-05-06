-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: paint_colors catalog
-- Description: Professional staples across 4 brands. Hex values are
--              approximations of the published swatches (subject to the
--              "confirm with physical samples" disclaimer). Counts:
--                Sherwin-Williams: 30
--                Benjamin Moore:   30
--                Farrow & Ball:    30
--                Pantone TPG:      30
--              Total: 120 rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Sherwin-Williams (30) ───────────────────────────────────────────────────

INSERT INTO paint_colors (brand, code, name, hex, family, lrv) VALUES
  ('sherwin_williams', 'SW7008', 'Alabaster',                  '#EDEAE0', 'white',  82.43),
  ('sherwin_williams', 'SW7005', 'Pure White',                 '#EDECE6', 'white',  84.00),
  ('sherwin_williams', 'SW7029', 'Agreeable Gray',             '#D1C7B8', 'gray',   60.00),
  ('sherwin_williams', 'SW7016', 'Mindful Gray',               '#BDB6AB', 'gray',   48.00),
  ('sherwin_williams', 'SW7036', 'Accessible Beige',           '#CFC2AE', 'beige',  58.00),
  ('sherwin_williams', 'SW7037', 'Balanced Beige',             '#C5B5A1', 'beige',  46.00),
  ('sherwin_williams', 'SW6204', 'Sea Salt',                   '#CDD3C8', 'green',  63.00),
  ('sherwin_williams', 'SW6385', 'Dover White',                '#EBDFC8', 'white',  73.00),
  ('sherwin_williams', 'SW6105', 'Divine White',               '#E0D6C2', 'white',  68.00),
  ('sherwin_williams', 'SW7011', 'Natural Choice',             '#E1D7C5', 'white',  72.00),
  ('sherwin_williams', 'SW9166', 'Drift of Mist',              '#D6D2C5', 'gray',   65.00),
  ('sherwin_williams', 'SW7647', 'Crushed Ice',                '#D2D1C7', 'gray',   65.00),
  ('sherwin_williams', 'SW6207', 'Retreat',                    '#5D6E64', 'green',  17.00),
  ('sherwin_williams', 'SW6258', 'Tricorn Black',              '#1F1F1F', 'black',   3.00),
  ('sherwin_williams', 'SW6991', 'Black Magic',                '#262525', 'black',   3.50),
  ('sherwin_williams', 'SW7069', 'Iron Ore',                   '#43423E', 'black',   6.00),
  ('sherwin_williams', 'SW7048', 'Urbane Bronze',              '#5C5650', 'gray',    8.00),
  ('sherwin_williams', 'SW7674', 'Peppercorn',                 '#564F47', 'gray',   10.00),
  ('sherwin_williams', 'SW7015', 'Repose Gray',                '#CFC8BA', 'gray',   58.00),
  ('sherwin_williams', 'SW7064', 'Passive',                    '#C7C5C0', 'gray',   60.00),
  ('sherwin_williams', 'SW6371', 'Vanillin',                   '#F0E2BD', 'yellow', 75.00),
  ('sherwin_williams', 'SW6244', 'Naval',                      '#2B3A4B', 'blue',    4.50),
  ('sherwin_williams', 'SW7601', 'Distance',                   '#3F596F', 'blue',   12.00),
  ('sherwin_williams', 'SW6258', 'Anchors Aweigh',             '#3B4452', 'blue',    7.00),
  ('sherwin_williams', 'SW6204', 'Topsail',                    '#BACBC9', 'blue',   55.00),
  ('sherwin_williams', 'SW9165', 'Gossamer Veil',              '#CEC8B8', 'gray',   60.00),
  ('sherwin_williams', 'SW7641', 'Collonade Gray',             '#C8C2B6', 'gray',   53.00),
  ('sherwin_williams', 'SW7551', 'Greek Villa',                '#EFE8DA', 'white',  84.00),
  ('sherwin_williams', 'SW6385', 'Soft Apricot',               '#F5D7B5', 'orange', 70.00),
  ('sherwin_williams', 'SW6920', 'Center Stage',               '#B23B36', 'red',    11.00)
ON CONFLICT (brand, code) DO NOTHING;

-- ─── Benjamin Moore (30) ─────────────────────────────────────────────────────

INSERT INTO paint_colors (brand, code, name, hex, family, lrv) VALUES
  ('benjamin_moore', 'OC-17',  'White Dove',                   '#EDE8DA', 'white',  85.38),
  ('benjamin_moore', 'OC-65',  'Chantilly Lace',               '#F1EEE3', 'white',  90.04),
  ('benjamin_moore', 'OC-117', 'Simply White',                 '#F1EBD8', 'white',  91.00),
  ('benjamin_moore', 'OC-45',  'Swiss Coffee',                 '#EDE3D2', 'white',  83.93),
  ('benjamin_moore', 'OC-22',  'Calm',                         '#DCD2BD', 'beige',  72.00),
  ('benjamin_moore', 'OC-23',  'Classic Gray',                 '#D7D0BF', 'gray',   74.78),
  ('benjamin_moore', 'OC-52',  'Gray Owl',                     '#CCC9BD', 'gray',   65.77),
  ('benjamin_moore', 'HC-172', 'Revere Pewter',                '#C6BCAA', 'gray',   55.51),
  ('benjamin_moore', '1546',   'Pale Oak',                     '#D2C7B6', 'beige',  68.66),
  ('benjamin_moore', 'HC-86',  'Kingsport Gray',               '#A99C84', 'gray',   38.50),
  ('benjamin_moore', '1474',   'Stonington Gray',              '#BAB9AE', 'gray',   59.75),
  ('benjamin_moore', '2121-30','Hale Navy',                    '#3B4858', 'blue',    6.30),
  ('benjamin_moore', 'HC-154', 'Hale Navy',                    '#414B5A', 'blue',    7.40),
  ('benjamin_moore', '2134-10','Onyx',                         '#252628', 'black',   3.21),
  ('benjamin_moore', '2132-10','Black',                        '#1B1B1B', 'black',   3.00),
  ('benjamin_moore', 'HC-166', 'Kendall Charcoal',             '#69655B', 'gray',   13.21),
  ('benjamin_moore', 'CSP-265','Wrought Iron',                 '#4A4D4A', 'black',   6.16),
  ('benjamin_moore', 'HC-77',  'Alexandria Beige',             '#A48E72', 'beige',  31.00),
  ('benjamin_moore', 'HC-105', 'Rockport Gray',                '#A29B89', 'gray',   38.00),
  ('benjamin_moore', '2143-40','Camouflage',                   '#A2987C', 'green',  37.00),
  ('benjamin_moore', '2126-30','Knoxville Gray',               '#3F4A48', 'green',   8.00),
  ('benjamin_moore', '2113-30','Iron Mountain',                '#52514E', 'gray',    9.50),
  ('benjamin_moore', 'HC-166', 'Hancock Green',                '#4A5046', 'green',   9.00),
  ('benjamin_moore', 'HC-115', 'Tate Olive',                   '#5C5B4B', 'green',   9.50),
  ('benjamin_moore', '2123-50','Wedgewood Gray',               '#B4BEC4', 'blue',   53.00),
  ('benjamin_moore', 'CC-440', 'Buxton Blue',                  '#A1B4BD', 'blue',   46.00),
  ('benjamin_moore', '2058-30','Newburg Green',                '#1F5A60', 'green',   6.50),
  ('benjamin_moore', '2160-30','Million Dollar Red',           '#7C1F25', 'red',     4.50),
  ('benjamin_moore', '2099-10','Caliente',                     '#B33A3A', 'red',     8.00),
  ('benjamin_moore', '2167-50','Ylang Ylang',                  '#F5DBA8', 'yellow', 73.00)
ON CONFLICT (brand, code) DO NOTHING;

-- ─── Farrow & Ball (30) ──────────────────────────────────────────────────────

INSERT INTO paint_colors (brand, code, name, hex, family, lrv) VALUES
  ('farrow_ball',     '1',     'Lime White',                   '#E5DFC6', 'white',  76.00),
  ('farrow_ball',     '2',     'Off-White',                    '#E0DCC6', 'white',  72.00),
  ('farrow_ball',     '9',     'Off-White',                    '#E0DBCB', 'white',  73.00),
  ('farrow_ball',     '3',     'Off-Black',                    '#383735', 'black',   3.50),
  ('farrow_ball',     '4',     'Old White',                    '#D7CFB6', 'white',  64.00),
  ('farrow_ball',     '5',     'Hardwick White',               '#CFC8AF', 'white',  61.00),
  ('farrow_ball',     '6',     'London Stone',                 '#B6A98A', 'beige',  39.00),
  ('farrow_ball',     '8',     'String',                       '#D7C8A6', 'beige',  54.00),
  ('farrow_ball',     '17',    'Light Stone',                  '#BDAA8A', 'beige',  41.00),
  ('farrow_ball',     '20',    'Cane',                         '#CFB789', 'yellow', 46.00),
  ('farrow_ball',     '26',    'Down Pipe',                    '#615E57', 'gray',   13.00),
  ('farrow_ball',     '27',    'Parma Gray',                   '#B7BDB8', 'blue',   50.00),
  ('farrow_ball',     '37',    'Hay',                          '#C9A867', 'yellow', 38.00),
  ('farrow_ball',     '40',    'Mouse''s Back',                '#7F7259', 'green',  19.00),
  ('farrow_ball',     '57',    'Pavilion Blue',                '#9DB0AB', 'blue',   38.00),
  ('farrow_ball',     '61',    'Cooks Blue',                   '#3E576F', 'blue',    8.00),
  ('farrow_ball',     '83',    'Borrowed Light',               '#D2DBD7', 'blue',   65.00),
  ('farrow_ball',     '92',    'Studio Green',                 '#3A453B', 'green',   5.00),
  ('farrow_ball',     '202',   'Pink Ground',                  '#E9D7C6', 'pink',   70.00),
  ('farrow_ball',     '212',   'Saxon Green',                  '#979E79', 'green',  31.00),
  ('farrow_ball',     '227',   'Cornforth White',              '#C7C2B7', 'gray',   58.00),
  ('farrow_ball',     '228',   'Cornforth White',              '#C8C3B8', 'gray',   58.50),
  ('farrow_ball',     '231',   'Strong White',                 '#D5CFC1', 'white',  62.00),
  ('farrow_ball',     '232',   'Pavilion Gray',                '#B6B0A4', 'gray',   45.00),
  ('farrow_ball',     '274',   'Ammonite',                     '#C7C0B1', 'gray',   55.00),
  ('farrow_ball',     '285',   'Skimming Stone',               '#D2C8B7', 'beige',  60.00),
  ('farrow_ball',     '294',   'Wevet',                        '#DCD7CB', 'white',  68.00),
  ('farrow_ball',     '296',   'Dimpse',                       '#BAB7AE', 'gray',   50.00),
  ('farrow_ball',     '297',   'Treron',                       '#5F6253', 'green',   9.00),
  ('farrow_ball',     '298',   'Bancha',                       '#5C5C40', 'green',  10.00)
ON CONFLICT (brand, code) DO NOTHING;

-- ─── Pantone TPG (30) ────────────────────────────────────────────────────────

INSERT INTO paint_colors (brand, code, name, hex, family, lrv) VALUES
  ('pantone_tpg',     '11-0601','Bright White',                '#F4F5F0', 'white',  90.00),
  ('pantone_tpg',     '11-4001','Brilliant White',             '#EDEEE9', 'white',  88.00),
  ('pantone_tpg',     '11-0507','Egret',                       '#F0E9D6', 'white',  82.00),
  ('pantone_tpg',     '12-0712','Cream Tan',                   '#E2D5B7', 'beige',  68.00),
  ('pantone_tpg',     '13-0907','Almond Buff',                 '#D5BE9C', 'beige',  56.00),
  ('pantone_tpg',     '14-1310','Frappe',                      '#C8A98A', 'beige',  43.00),
  ('pantone_tpg',     '15-1304','Tannin',                      '#A88A6E', 'brown',  29.00),
  ('pantone_tpg',     '16-1212','Tigers Eye',                  '#9C7958', 'brown',  21.00),
  ('pantone_tpg',     '17-1230','Cathay Spice',                '#9C5430', 'orange', 11.00),
  ('pantone_tpg',     '18-1250','Rust',                        '#8C4524', 'orange',  8.00),
  ('pantone_tpg',     '19-1664','Fiery Red',                   '#A92B2B', 'red',     7.00),
  ('pantone_tpg',     '18-1763','High Risk Red',               '#B8232C', 'red',    10.00),
  ('pantone_tpg',     '19-1557','Chili Pepper',                '#8E2A2D', 'red',     6.00),
  ('pantone_tpg',     '17-1462','Flame',                       '#E0563E', 'orange', 22.00),
  ('pantone_tpg',     '13-0859','Cyber Yellow',                '#F2C220', 'yellow', 60.00),
  ('pantone_tpg',     '14-0848','Mimosa',                      '#F0C04F', 'yellow', 62.00),
  ('pantone_tpg',     '15-0343','Greenery',                    '#88B048', 'green',  44.00),
  ('pantone_tpg',     '16-5938','Jade Cream',                  '#9DB89A', 'green',  43.00),
  ('pantone_tpg',     '18-5424','Ultramarine Green',           '#1B5F4D', 'green',   7.00),
  ('pantone_tpg',     '19-5414','Trekking Green',              '#1E4538', 'green',   4.00),
  ('pantone_tpg',     '14-4318','Hawaiian Ocean',              '#5BB0CA', 'blue',   42.00),
  ('pantone_tpg',     '17-4528','Mykonos Blue',                '#2E5C82', 'blue',   12.00),
  ('pantone_tpg',     '19-3938','True Blue',                   '#3650A4', 'blue',     8.00),
  ('pantone_tpg',     '19-3933','Sodalite Blue',               '#2A3878', 'blue',     5.00),
  ('pantone_tpg',     '19-4052','Classic Blue',                '#0F4C81', 'blue',     6.00),
  ('pantone_tpg',     '14-3812','Lilac Hint',                  '#C8B8D3', 'purple', 56.00),
  ('pantone_tpg',     '17-3725','Aster Purple',                '#776199', 'purple', 18.00),
  ('pantone_tpg',     '19-3815','Astral Aura',                 '#272A5A', 'purple',  4.50),
  ('pantone_tpg',     '17-1540','Coral',                       '#F08070', 'pink',   45.00),
  ('pantone_tpg',     '13-1520','Rose Quartz',                 '#F2C5C5', 'pink',   65.00)
ON CONFLICT (brand, code) DO NOTHING;
