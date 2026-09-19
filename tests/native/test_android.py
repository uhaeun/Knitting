"""
안드로이드 앱(하이브리드)에서만 확인되는 것.
- 카메라 권한은 처음 한 번만 묻는다 (웹앱은 브라우저가 매번 묻는다)
- 결과 사진이 공유 창 없이 갤러리에 들어간다
- 촬영 알림이 정한 시각에 온다
"""
import datetime
import re
import time

from conftest import PACKAGE, adb
from app import (
    allow_permission_if_asked, camera_ready, click_label, click_text, page_text, sign_up_with_project, to_native, to_web, wait,
)


def test_camera_permission_is_asked_once(driver):
    sign_up_with_project(driver)
    click_text(driver, "사진 찍기")
    assert allow_permission_if_asked(driver, 15), "처음 촬영에서는 카메라 권한을 물어야 해요"
    camera_ready(driver)

    # 앱을 완전히 닫았다가 다시 연다
    driver.terminate_app(PACKAGE)
    driver.activate_app(PACKAGE)
    to_web(driver, fresh=True)
    try:
        wait(lambda: "시험 목도리" in page_text(driver), 60, what="편물 목록")
    except AssertionError as e:
        raise AssertionError(f"{e}\n화면: {page_text(driver)[:300]!r}\n주소: {driver.current_url}") from None
    click_label(driver, "시험 목도리 찍기")
    assert not allow_permission_if_asked(driver, 6), "다시 열었을 때는 권한을 또 묻지 않아야 해요"
    camera_ready(driver)


def _gallery_count() -> int:
    out = adb("shell", "content", "query", "--uri", "content://media/external/images/media", "--projection", "_id")
    return len([l for l in out.splitlines() if l.startswith("Row:")])


def test_result_photo_goes_to_gallery_without_share_sheet(driver):
    sign_up_with_project(driver)
    click_text(driver, "사진 찍기")
    allow_permission_if_asked(driver, 15)
    camera_ready(driver)
    click_label(driver, "촬영")
    wait(lambda: "1번째 / 1" in page_text(driver), 60, what="첫 기록 저장")

    before = _gallery_count()
    click_text(driver, "결과 사진")
    wait(lambda: driver.execute_script(
        "return [...document.querySelectorAll('[role=\"button\"]')].some(b => b.textContent === '사진첩에 저장' && b.getAttribute('aria-disabled') !== 'true')"
    ), 60, what="결과 사진 준비")
    click_text(driver, "사진첩에 저장")
    allow_permission_if_asked(driver, 5)  # 기기에 따라 사진 접근 권한을 묻는다
    try:
        wait(lambda: "사진첩에 저장했어요" in page_text(driver), 30, what="저장 완료 안내")
    except AssertionError as e:
        raise AssertionError(f"{e}\n화면: {page_text(driver)[-300:]!r}") from None
    wait(lambda: _gallery_count() > before, 20, what="갤러리에 사진 추가")


def test_reminder_notification_arrives(driver):
    sign_up_with_project(driver)
    # 편물 화면에는 톱니가 없다 → 목록으로
    driver.execute_script("history.back()")
    wait(lambda: "내 편물" in page_text(driver), 30, what="편물 목록")
    click_label(driver, "설정")
    wait(lambda: "촬영 알림" in page_text(driver), 30, what="설정 화면")

    # 알림 켜기 → 안드로이드 13+ 알림 권한
    # '알림 받기' 줄에 있는 스위치를 누른다 (위에 '비공개 계정' 스위치도 있다)
    switched = driver.execute_script("""
      const label = [...document.querySelectorAll('div')].find((e) => e.textContent === '알림 받기');
      let row = label;
      while (row && !row.querySelector('input[type=checkbox]')) row = row.parentElement;
      const sw = row && row.querySelector('input[type=checkbox]');
      if (!sw) return false;
      sw.click();
      return true;
    """)
    assert switched, "알림 받기 스위치를 찾지 못했어요"
    allow_permission_if_asked(driver, 10)
    try:
        wait(lambda: "매일" in page_text(driver), 20, what="알림 켜짐")
    except AssertionError as e:
        raise AssertionError(f"{e}\n화면: {page_text(driver)[-400:]!r}") from None

    # 기기 시계로 2분 뒤를 고른다 (분이 바로 넘어가는 경계를 피한다)
    now = adb("shell", "date", "+%H:%M").strip()
    h, m = map(int, now.split(":"))
    at = (datetime.datetime(2000, 1, 1, h, m) + datetime.timedelta(minutes=2)).strftime("%H:%M")
    driver.execute_script(
        """
        const el = document.querySelector('input[type=time]');
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, arguments[0]);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        """,
        at,
    )
    wait(lambda: re.search(r"오[전후] \d+:\d\d", page_text(driver)), 10, what="시각 반영")

    # 알림을 받으려면 앱이 뒤로 가 있어도 된다
    driver.background_app(-1)
    to_native(driver)
    driver.open_notifications()
    # 대략 시각으로 예약하므로 안드로이드가 몇 분 모아서 보낼 수 있다
    wait(lambda: driver.find_elements("xpath", "//*[contains(@text, '오늘 뜨개했다면')]"), 900, every=10, what="촬영 알림 도착")
