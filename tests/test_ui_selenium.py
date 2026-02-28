"""Selenium smoke tests for ZHA Diagnostic Tool UI.

Usage:
  1. Start mock server: python tests/mock_server.py  (in background)
  2. Run tests:         python -m pytest tests/test_ui_selenium.py -v

Requires: pip install selenium pytest
Uses Chrome by default.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://127.0.0.1:8099"
MOCK_SCRIPT = Path(__file__).parent / "mock_server.py"


@pytest.fixture(scope="session")
def mock_server():
    proc = subprocess.Popen(
        [sys.executable, str(MOCK_SCRIPT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(2)  # let server start
    yield proc
    proc.terminate()
    proc.wait(timeout=5)


@pytest.fixture(scope="session")
def driver(mock_server):
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    d = webdriver.Chrome(options=opts)
    d.implicitly_wait(3)
    yield d
    d.quit()


def wait_for(driver, by, value, timeout=10):
    return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, value)))


def click_taskbar(driver, win_id):
    """Click a taskbar button to open a window."""
    btn = driver.find_element(By.CSS_SELECTOR, f'.taskbar-app[data-win="{win_id}"]')
    btn.click()
    time.sleep(0.5)


class TestBasicLoad:
    def test_page_loads(self, driver):
        driver.get(BASE)
        time.sleep(2)
        assert "ZHA" in driver.title or driver.find_element(By.ID, "desktop")

    def test_kpi_window_open(self, driver):
        driver.get(BASE)
        time.sleep(2)
        kpi = driver.find_element(By.ID, "kpi-win")
        assert "open" in kpi.get_attribute("class")

    def test_taskbar_present(self, driver):
        driver.get(BASE)
        time.sleep(1)
        taskbar = driver.find_element(By.CSS_SELECTOR, ".taskbar")
        assert taskbar.is_displayed()


class TestDeviceHelper:
    def test_devhelper_opens(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(1)
        win = driver.find_element(By.ID, "devhelper-win")
        assert "open" in win.get_attribute("class")

    def test_three_columns_present(self, driver):
        """Device Helper should have 3 columns: left, center, right."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(1)

        left = driver.find_element(By.ID, "devhelper-left")
        center = driver.find_element(By.ID, "devhelper-center")
        right = driver.find_element(By.ID, "devhelper-right")

        assert left.is_displayed()
        assert center.is_displayed()
        assert right.is_displayed()

        # Verify horizontal order (left.x < center.x < right.x)
        lx = left.location["x"]
        cx = center.location["x"]
        rx = right.location["x"]
        assert lx < cx < rx, f"Column positions wrong: left={lx}, center={cx}, right={rx}"

    def test_two_resize_bars(self, driver):
        """Both resize bars should be present."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(1)

        bar1 = driver.find_element(By.ID, "devhelper-resize-bar")
        bar2 = driver.find_element(By.ID, "devhelper-resize-bar2")
        assert bar1.is_displayed()
        assert bar2.is_displayed()

    def test_device_list_populated(self, driver):
        """Device list should show mock devices (non-coordinators)."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(2)

        device_list = driver.find_element(By.ID, "devhelper-device-list")
        rows = device_list.find_elements(By.CSS_SELECTOR, ".row")
        # Mock has 4 devices, 1 coordinator → 3 non-coordinator rows
        assert len(rows) >= 3, f"Expected 3+ device rows, got {len(rows)}"

    def test_click_device_shows_info(self, driver):
        """Clicking a device should populate device info and clusters."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(2)

        rows = driver.find_elements(By.CSS_SELECTOR, "#devhelper-device-list .row")
        if rows:
            rows[0].click()
            time.sleep(1)

            info = driver.find_element(By.ID, "devhelper-device-info")
            info_text = info.text
            assert len(info_text) > 10, "Device info should show details"

            clusters = driver.find_element(By.ID, "devhelper-clusters")
            cluster_text = clusters.text
            assert len(cluster_text) > 0, "Clusters panel should have content"

    def test_clusters_in_right_column(self, driver):
        """Clusters panel should be in the right column, not the center."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(2)

        rows = driver.find_elements(By.CSS_SELECTOR, "#devhelper-device-list .row")
        if rows:
            rows[0].click()
            time.sleep(1)

        clusters = driver.find_element(By.ID, "devhelper-clusters")
        info = driver.find_element(By.ID, "devhelper-device-info")
        # Clusters should be to the right of device info
        cx = clusters.location["x"]
        ix = info.location["x"]
        assert cx > ix, f"Clusters ({cx}) should be to the right of info ({ix})"

    def test_resize_bar_draggable(self, driver):
        """Resize bar 1 should change left column width when dragged."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "devhelper-win")
        time.sleep(1)

        left = driver.find_element(By.ID, "devhelper-left")
        bar = driver.find_element(By.ID, "devhelper-resize-bar")
        initial_w = left.size["width"]

        actions = ActionChains(driver)
        actions.click_and_hold(bar).move_by_offset(50, 0).release().perform()
        time.sleep(0.5)

        new_w = left.size["width"]
        # Width should have increased (approximately)
        assert new_w > initial_w + 20, f"Left column should widen: was {initial_w}, now {new_w}"


class TestAnnotation:
    def test_annotate_button_exists(self, driver):
        driver.get(BASE)
        time.sleep(1)
        btn = driver.find_element(By.ID, "annotate-btn")
        assert btn.is_displayed()

    def test_annotate_overlay_toggles(self, driver):
        driver.get(BASE)
        time.sleep(1)

        overlay = driver.find_element(By.ID, "annotate-overlay")
        assert "hidden" in overlay.get_attribute("class")

        btn = driver.find_element(By.ID, "annotate-btn")
        btn.click()
        time.sleep(0.5)
        assert "hidden" not in overlay.get_attribute("class")

        close = driver.find_element(By.ID, "annotate-close")
        close.click()
        time.sleep(0.5)
        assert "hidden" in overlay.get_attribute("class")

    def test_annotate_draw(self, driver):
        """Drawing on canvas should work without errors."""
        driver.get(BASE)
        time.sleep(1)
        driver.find_element(By.ID, "annotate-btn").click()
        time.sleep(0.5)

        canvas = driver.find_element(By.ID, "annotate-canvas")
        actions = ActionChains(driver)
        actions.move_to_element_with_offset(canvas, 100, 100)
        actions.click_and_hold().move_by_offset(200, 100).release().perform()
        time.sleep(0.3)
        # No crash = pass

    def test_add_note(self, driver):
        driver.get(BASE)
        time.sleep(1)
        driver.find_element(By.ID, "annotate-btn").click()
        time.sleep(0.5)

        add_btn = driver.find_element(By.ID, "annotate-add-note")
        add_btn.click()
        time.sleep(0.3)

        notes = driver.find_elements(By.CSS_SELECTOR, ".annotate-note-item textarea")
        assert len(notes) >= 1, "Note textarea should appear"

    def test_tool_switching(self, driver):
        driver.get(BASE)
        time.sleep(1)
        driver.find_element(By.ID, "annotate-btn").click()
        time.sleep(0.5)

        arrow_btn = driver.find_element(By.CSS_SELECTOR, '.annotate-tool[data-tool="arrow"]')
        arrow_btn.click()
        time.sleep(0.2)
        assert "active" in arrow_btn.get_attribute("class")

        pen_btn = driver.find_element(By.CSS_SELECTOR, '.annotate-tool[data-tool="pen"]')
        assert "active" not in pen_btn.get_attribute("class")


class TestNetworkMap:
    def test_netmap_opens(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netmap-win")
        time.sleep(1)
        win = driver.find_element(By.ID, "netmap-win")
        assert "open" in win.get_attribute("class")

    def test_netmap_canvas_present(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netmap-win")
        time.sleep(1)
        canvas = driver.find_element(By.ID, "netmap-canvas")
        assert canvas.is_displayed()

    def test_netmap_toolbar_buttons(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netmap-win")
        time.sleep(1)
        for btn_id in ["netmap-scan-btn", "netmap-bg-btn", "netmap-bg-clear-btn", "netmap-reset-btn"]:
            btn = driver.find_element(By.ID, btn_id)
            assert btn.is_displayed(), f"{btn_id} should be visible"

    def test_netmap_scan_click(self, driver):
        """Clicking Scan should not crash."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netmap-win")
        time.sleep(1)
        driver.find_element(By.ID, "netmap-scan-btn").click()
        time.sleep(1)
        # No crash = pass; canvas still present
        assert driver.find_element(By.ID, "netmap-canvas").is_displayed()


class TestGroupsWindow:
    def test_groups_opens(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "groups-win")
        time.sleep(1)
        win = driver.find_element(By.ID, "groups-win")
        assert "open" in win.get_attribute("class")

    def test_groups_toolbar(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "groups-win")
        time.sleep(1)
        refresh = driver.find_element(By.ID, "groups-refresh-btn")
        add = driver.find_element(By.ID, "groups-add-btn")
        assert refresh.is_displayed()
        assert add.is_displayed()

    def test_groups_add_dialog(self, driver):
        """Clicking 'New Group' should show the add dialog."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "groups-win")
        time.sleep(1)
        btn = driver.find_element(By.ID, "groups-add-btn")
        driver.execute_script("arguments[0].click()", btn)
        time.sleep(0.5)
        dialog = driver.find_element(By.ID, "groups-add-dialog")
        assert dialog.is_displayed()

    def test_groups_list_present(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "groups-win")
        time.sleep(1)
        lst = driver.find_element(By.ID, "groups-list")
        assert lst is not None


class TestBindingWindow:
    def test_binding_opens(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "binding-win")
        time.sleep(1)
        win = driver.find_element(By.ID, "binding-win")
        assert "open" in win.get_attribute("class")

    def test_binding_source_select(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "binding-win")
        time.sleep(1)
        sel = driver.find_element(By.ID, "bind-source-select")
        assert sel.is_displayed()

    def test_binding_find_btn(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "binding-win")
        time.sleep(1)
        btn = driver.find_element(By.ID, "bind-find-btn")
        assert btn.is_displayed()


class TestNetworkSettings:
    def test_netsettings_opens(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netsettings-win")
        time.sleep(1)
        win = driver.find_element(By.ID, "netsettings-win")
        assert "open" in win.get_attribute("class")

    def test_netsettings_info_loaded(self, driver):
        """Network settings info should show radio type and channel."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netsettings-win")
        time.sleep(2)
        info = driver.find_element(By.ID, "netsettings-info")
        text = info.text
        assert "Radio Type" in text or "Channel" in text, f"Expected network info, got: {text}"

    def test_netsettings_channel_select(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netsettings-win")
        time.sleep(1)
        sel = driver.find_element(By.ID, "netsettings-channel")
        assert sel.is_displayed()

    def test_netsettings_backup_btn(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netsettings-win")
        time.sleep(1)
        btn = driver.find_element(By.ID, "netsettings-backup-btn")
        assert btn.is_displayed()

    def test_netsettings_permit_btn(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "netsettings-win")
        time.sleep(1)
        btn = driver.find_element(By.ID, "netsettings-permit-btn")
        assert btn.is_displayed()


class TestPdfReport:
    def test_pdfreport_opens(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "pdfreport-win")
        time.sleep(1)
        win = driver.find_element(By.ID, "pdfreport-win")
        assert "open" in win.get_attribute("class")

    def test_pdfreport_toolbar_buttons(self, driver):
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "pdfreport-win")
        time.sleep(1)
        for btn_id in ["pdfreport-capture-btn", "pdfreport-paste-btn", "pdfreport-file-btn",
                        "pdfreport-generate-btn", "pdfreport-clear-btn"]:
            btn = driver.find_element(By.ID, btn_id)
            assert btn.is_displayed(), f"{btn_id} should be visible"

    def test_pdfreport_empty_state(self, driver):
        """Should show empty state message when no pages added."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "pdfreport-win")
        time.sleep(1)
        pages = driver.find_element(By.ID, "pdfreport-pages")
        assert "No pages yet" in pages.text

    def test_pdfreport_capture_click(self, driver):
        """Clicking Capture should add a page (screenshot of desktop)."""
        driver.get(BASE)
        time.sleep(2)
        click_taskbar(driver, "pdfreport-win")
        time.sleep(1)
        btn = driver.find_element(By.ID, "pdfreport-capture-btn")
        driver.execute_script("arguments[0].click()", btn)
        time.sleep(3)
        pages = driver.find_element(By.ID, "pdfreport-pages")
        cards = pages.find_elements(By.CSS_SELECTOR, ".pdfreport-page-card")
        assert len(cards) >= 1, "Capture should add a page card"


class TestDesktopShortcuts:
    def test_shortcut_opens_groups(self, driver):
        driver.get(BASE)
        time.sleep(2)
        shortcut = driver.find_element(By.CSS_SELECTOR, '.desktop-shortcut[data-win="groups-win"]')
        driver.execute_script("arguments[0].dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))", shortcut)
        time.sleep(1)
        win = driver.find_element(By.ID, "groups-win")
        assert "open" in win.get_attribute("class")

    def test_shortcut_opens_binding(self, driver):
        driver.get(BASE)
        time.sleep(2)
        shortcut = driver.find_element(By.CSS_SELECTOR, '.desktop-shortcut[data-win="binding-win"]')
        driver.execute_script("arguments[0].dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))", shortcut)
        time.sleep(1)
        win = driver.find_element(By.ID, "binding-win")
        assert "open" in win.get_attribute("class")

    def test_shortcut_opens_netsettings(self, driver):
        driver.get(BASE)
        time.sleep(2)
        shortcut = driver.find_element(By.CSS_SELECTOR, '.desktop-shortcut[data-win="netsettings-win"]')
        driver.execute_script("arguments[0].dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))", shortcut)
        time.sleep(1)
        win = driver.find_element(By.ID, "netsettings-win")
        assert "open" in win.get_attribute("class")

    def test_shortcut_opens_pdfreport(self, driver):
        driver.get(BASE)
        time.sleep(2)
        shortcut = driver.find_element(By.CSS_SELECTOR, '.desktop-shortcut[data-win="pdfreport-win"]')
        driver.execute_script("arguments[0].dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))", shortcut)
        time.sleep(1)
        win = driver.find_element(By.ID, "pdfreport-win")
        assert "open" in win.get_attribute("class")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
