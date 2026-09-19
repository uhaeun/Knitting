"""앱 조작 도우미. 웹뷰 안은 CSS·텍스트로, 권한 창·알림은 안드로이드 요소로 찾는다."""
import time
import uuid

from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import NoSuchElementException, WebDriverException

WEB = "WEBVIEW_app.knitting.web"
NATIVE = "NATIVE_APP"

# 안드로이드 권한 창의 '허용' 버튼들 (버전마다 id가 다르다)
ALLOW_IDS = [
    "com.android.permissioncontroller:id/permission_allow_foreground_only_button",
    "com.android.permissioncontroller:id/permission_allow_one_time_button",
    "com.android.permissioncontroller:id/permission_allow_button",
]


def wait(pred, timeout=30, every=0.5, what="조건"):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        try:
            v = pred()
            if v:
                return v
        except (WebDriverException, NoSuchElementException) as e:  # 화면 전환 중
            last = e
        time.sleep(every)
    raise AssertionError(f"{timeout}초 안에 {what}이(가) 안 됐어요 ({last})")


def to_web(d, fresh=False):
    """웹뷰로. 앱을 다시 열어 웹뷰가 새로 생겼으면 fresh=True — 네이티브를 거쳐 크롬드라이버를 새로 붙인다"""
    if fresh:
        d.switch_to.context(NATIVE)
        time.sleep(2)
    wait(lambda: WEB in d.contexts, 60, what="웹뷰 준비")
    d.switch_to.context(WEB)


def to_native(d):
    d.switch_to.context(NATIVE)


def page_text(d) -> str:
    return d.execute_script("return document.body.innerText")


def click_text(d, text, exact=True, timeout=30):
    """보이는 글자로 누른다. 버튼·링크·라벨 어느 것이든"""
    xpath = f"//*[normalize-space(text())='{text}']" if exact else f"//*[contains(normalize-space(.), '{text}')]"
    el = wait(lambda: next((e for e in d.find_elements(AppiumBy.XPATH, xpath) if e.is_displayed()), None), timeout, what=f"'{text}' 표시")
    el.click()


def click_label(d, label, timeout=30):
    el = wait(lambda: next((e for e in d.find_elements(AppiumBy.CSS_SELECTOR, f"[aria-label='{label}']") if e.is_displayed()), None), timeout, what=f"'{label}' 버튼")
    el.click()


def fill(d, placeholder, value):
    el = wait(lambda: d.find_element(AppiumBy.CSS_SELECTOR, f"[placeholder='{placeholder}']"), what=f"'{placeholder}' 입력칸")
    el.clear()
    el.send_keys(value)


def sign_up_with_project(d, project="시험 목도리"):
    """새 계정 + 편물 하나. 사용법 안내는 건너뛴다"""
    to_web(d)
    wait(lambda: "계정이 없어요" in page_text(d), 90, what="로그인 화면")
    d.execute_script("try { localStorage.setItem('knitting.tourSeen', '1') } catch (e) {}")
    stamp = uuid.uuid4().hex[:8]
    click_text(d, "계정이 없어요, 가입할게요")
    fill(d, "you@example.com", f"native_{stamp}@example.com")
    fill(d, "6자 이상", "password123")
    click_text(d, "가입하기")
    fill(d, "knitter_haeun", f"native_{stamp}")
    fill(d, "하은", "네이티브")
    click_text(d, "시작하기")
    wait(lambda: "내 편물" in page_text(d), 30, what="편물 목록")
    click_label(d, "편물 추가")
    fill(d, "예: 회색 라글란 스웨터", project)
    click_text(d, "만들기")
    wait(lambda: "아직 사진이 없어요" in page_text(d), 30, what="편물 화면")


def allow_permission_if_asked(d, timeout=10) -> bool:
    """권한 창이 뜨면 '허용'. 떴으면 True"""
    to_native(d)
    try:
        def find():
            for rid in ALLOW_IDS:
                els = d.find_elements(AppiumBy.ID, rid)
                if els:
                    return els[0]
            return None
        btn = wait(find, timeout, every=0.5, what="권한 창")
        btn.click()
        return True
    except AssertionError:
        return False
    finally:
        to_web(d)


def camera_ready(d, timeout=30):
    wait(lambda: d.execute_script("const v = document.querySelector('video'); return !!v && v.videoWidth > 0"), timeout, what="카메라 화면")
