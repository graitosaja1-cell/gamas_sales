import pandas as pd

# Read all sheets
xl = pd.ExcelFile('data excel/tag-suplyer&rekening.xlsx')
print("Sheet names:", xl.sheet_names)

for sheet in xl.sheet_names:
    print(f"\n=== SHEET: {sheet} ===")
    df = pd.read_excel(xl, sheet_name=sheet, header=None)
    print(df.to_string())
