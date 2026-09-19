"""
네이티브(하이브리드 앱) 검사 공통 준비. Appium 서버가 없으면 띄우고, 테스트마다 앱을 새로 설치한 상태로 연다.

웹 화면(웹뷰 안)은 WEBVIEW 컨텍스트로, 권한 창·알림처럼 OS가 그리는 것은 NATIVE_APP 컨텍스트로 다룬다.
"""
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest
from appium import webdriver
from appium.options.android import UiAutomator2Options

HERE = Path(__file__).parent
APK = HERE / "out" / "knitting-test.apk"
PACKAGE = "app.knitting.web"
# 4723은 다른 작업의 Appium이 쓰고 있을 수 있어 비켜 간다
APPIUM_PORT = int(os.environ.get("APPIUM_PORT", "4725"))
ADB = shutil.which("adb") or str(Path.home() / "Library/Android/sdk/platform-tools/adb")


def _port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


@pytest.fixture(scope="session")
def appium_server():
    """이미 떠 있으면 그대로 쓰고, 없으면 띄운다 (웹뷰용 크롬드라이버 자동 내려받기 허용)."""
    if _port_open(APPIUM_PORT):
        yield
        return
    log = open(HERE / "out" / "appium.log", "w")
    proc = subprocess.Popen(
        ["appium", "--port", str(APPIUM_PORT), "--allow-insecure", "uiautomator2:chromedriver_autodownload"],
        stdout=log, stderr=subprocess.STDOUT,
    )
    for _ in range(60):
        if _port_open(APPIUM_PORT):
            break
        time.sleep(1)
    yield
    proc.terminate()
    log.close()


def adb(*args: str) -> str:
    return subprocess.run([ADB, *args], capture_output=True, text=True, check=False).stdout


@pytest.fixture
def driver(appium_server):
    """앱을 새로 설치한 상태로 연다. 권한은 자동으로 주지 않는다 — 권한 창을 직접 보려고."""
    assert APK.exists(), "먼저 tests/native/build-test-apk.sh 로 시험용 APK를 만드세요"
    adb("uninstall", PACKAGE)
    opts = UiAutomator2Options()
    opts.platform_name = "Android"
    opts.automation_name = "UiAutomator2"
    opts.app = str(APK)
    opts.app_package = PACKAGE
    opts.app_activity = ".MainActivity"
    opts.auto_grant_permissions = False
    opts.no_reset = False
    opts.new_command_timeout = 600
    opts.set_capability("appium:chromedriverAutodownload", True)
    opts.set_capability("appium:ensureWebviewsHavePages", True)
    # 에뮬레이터가 느릴 때 도우미 앱 설치·실행이 20초를 넘길 수 있다
    opts.set_capability("appium:uiautomator2ServerInstallTimeout", 120_000)
    opts.set_capability("appium:uiautomator2ServerLaunchTimeout", 120_000)
    opts.set_capability("appium:adbExecTimeout", 120_000)
    opts.set_capability("appium:androidInstallTimeout", 180_000)
    d = webdriver.Remote(f"http://127.0.0.1:{APPIUM_PORT}", options=opts)
    d.implicitly_wait(0)
    yield d
    d.quit()
