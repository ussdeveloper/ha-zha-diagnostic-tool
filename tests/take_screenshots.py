"""Take screenshots for visual verification."""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--window-size=1920,1080")
opts.add_argument("--disable-gpu")
d = webdriver.Chrome(options=opts)
d.get("http://127.0.0.1:8099")
time.sleep(3)

# Open DevHelper
btn = d.find_element(By.CSS_SELECTOR, '.taskbar-app[data-win="devhelper-win"]')
btn.click()
time.sleep(2)

# Click first device
rows = d.find_elements(By.CSS_SELECTOR, "#devhelper-device-list .row")
if rows:
    rows[0].click()
time.sleep(2)

# Expand first cluster
cluster_headers = d.find_elements(By.CSS_SELECTOR, ".cluster-header")
if cluster_headers:
    cluster_headers[0].click()
time.sleep(1)

d.save_screenshot("tests/screenshot_devhelper.png")
print("DevHelper screenshot saved")

# Check column positions
left = d.find_element(By.ID, "devhelper-left")
center = d.find_element(By.ID, "devhelper-center")
right = d.find_element(By.ID, "devhelper-right")
print(f"Left:   x={left.location['x']} w={left.size['width']}")
print(f"Center: x={center.location['x']} w={center.size['width']}")
print(f"Right:  x={right.location['x']} w={right.size['width']}")

# Annotation overlay
ann_btn = d.find_element(By.ID, "annotate-btn")
ann_btn.click()
time.sleep(1)
d.save_screenshot("tests/screenshot_annotate.png")
print("Annotation screenshot saved")

d.quit()
