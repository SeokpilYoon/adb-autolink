import { describe, expect, it } from "vitest";
import { center, dumpFailure, filterUi, formatUiNode, looksLikeGameSurface, parseUiDump } from "../src/uitree.js";

// Shaped like `uiautomator dump` output (the same format the guide screenshots were annotated from).
const SETTINGS = `UI hierchary dumped to: /sdcard/adbal-ui.xml
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
<node index="0" text="설정" resource-id="com.android.settings:id/title" class="android.widget.TextView" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[79,175][482,254]" />
<node index="1" text="" resource-id="com.android.settings:id/recycler_view" class="androidx.recyclerview.widget.RecyclerView" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="true" focused="false" scrollable="true" long-clickable="false" password="false" selected="false" bounds="[0,305][1080,2265]">
<node index="0" text="Wi-Fi &amp; 네트워크" resource-id="android:id/title" class="android.widget.TextView" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[203,400][800,465]" />
<node index="1" text="" resource-id="android:id/switch_widget" class="android.widget.Switch" package="com.android.settings" content-desc="블루투스" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[855,500][990,600]" />
<node index="2" text="" resource-id="" class="android.widget.LinearLayout" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,600][1080,700]" />
<node index="3" text="hunter2" resource-id="com.example:id/pw" class="android.widget.EditText" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="true" enabled="false" focusable="true" focused="true" scrollable="false" long-clickable="false" password="true" selected="false" bounds="[100,700][900,780]" />
<node index="4" text="숨김" resource-id="" class="android.widget.TextView" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][0,0]" />
</node>
</node>
</hierarchy>`;

const UNITY = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="1">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.game" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2400,1080]">
<node index="0" text="" resource-id="" class="android.view.SurfaceView" package="com.example.game" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="true" focused="true" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2400,1080]" />
</node>
</hierarchy>`;

describe("parseUiDump", () => {
  it("reads every node with decoded text, flags and bounds", () => {
    const nodes = parseUiDump(SETTINGS);
    expect(nodes).toHaveLength(8);
    const wifi = nodes.find((n) => n.text.startsWith("Wi-Fi"))!;
    expect(wifi.text).toBe("Wi-Fi & 네트워크");
    expect(wifi.clickable).toBe(true);
    expect(center(wifi)).toEqual([502, 433]);
  });
});

describe("filterUi", () => {
  const nodes = parseUiDump(SETTINGS);

  it("drops empty containers and zero-size nodes", () => {
    const { shown } = filterUi(nodes);
    const labels = shown.map((n) => n.text || n.desc || n.id);
    expect(labels).toContain("설정");
    expect(labels).not.toContain("숨김"); // no area
    expect(shown.some((n) => n.cls.endsWith("LinearLayout"))).toBe(false);
    expect(shown.some((n) => n.cls.endsWith("RecyclerView"))).toBe(true); // scrollable: worth listing
  });

  it("searches text, description and id, ignoring case", () => {
    expect(filterUi(nodes, { search: "wi-fi" }).shown).toHaveLength(1);
    expect(filterUi(nodes, { search: "블루투스" }).shown).toHaveLength(1);
    expect(filterUi(nodes, { search: "SWITCH_WIDGET" }).shown).toHaveLength(1);
  });

  it("keeps only touchable elements and honours the limit", () => {
    const touch = filterUi(nodes, { interactiveOnly: true });
    expect(touch.shown.every((n) => n.clickable || n.scrollable || n.checkable || n.longClickable)).toBe(true);
    const limited = filterUi(nodes, { limit: 2 });
    expect(limited.shown).toHaveLength(2);
    expect(limited.total).toBeGreaterThan(2);
  });
});

describe("formatUiNode", () => {
  const nodes = parseUiDump(SETTINGS);

  it("prints type, short id, flags and the center to tap", () => {
    const sw = nodes.find((n) => n.desc === "블루투스")!;
    expect(formatUiNode(sw, 3)).toBe(
      '[3] Switch desc="블루투스" id=switch_widget clickable,checked center=(923,550) bounds=[855,500,990,600]',
    );
  });

  it("never prints a password field's text", () => {
    const pw = nodes.find((n) => n.password)!;
    const line = formatUiNode(pw, 0);
    expect(line).not.toContain("hunter2");
    expect(line).toContain("focused,disabled");
  });
});

describe("game screens", () => {
  it("recognises an engine surface with nothing readable", () => {
    expect(looksLikeGameSurface(parseUiDump(UNITY))).toBe(true);
    expect(looksLikeGameSurface(parseUiDump(SETTINGS))).toBe(false);
  });

  it("tells an idle timeout from other dump failures", () => {
    expect(dumpFailure("ERROR: could not get idle state.")).toBe("idle");
    expect(dumpFailure("Killed")).toBe("other");
    expect(dumpFailure(SETTINGS)).toBeUndefined();
  });
});
