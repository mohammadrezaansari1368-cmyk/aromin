var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod2) => function __require() {
  return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// node_modules/dayjs/dayjs.min.js
var require_dayjs_min = __commonJS({
  "node_modules/dayjs/dayjs.min.js"(exports, module) {
    !function(t, e) {
      "object" == typeof exports && "undefined" != typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define(e) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs = e();
    }(exports, function() {
      "use strict";
      var t = 1e3, e = 6e4, n = 36e5, r = "millisecond", i = "second", s = "minute", u = "hour", a = "day", o = "week", c = "month", f = "quarter", h = "year", d = "date", l = "Invalid Date", $ = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/, y = /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g, M2 = { name: "en", weekdays: "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"), months: "January_February_March_April_May_June_July_August_September_October_November_December".split("_"), ordinal: function(t2) {
        var e2 = ["th", "st", "nd", "rd"], n2 = t2 % 100;
        return "[" + t2 + (e2[(n2 - 20) % 10] || e2[n2] || e2[0]) + "]";
      } }, m = function(t2, e2, n2) {
        var r2 = String(t2);
        return !r2 || r2.length >= e2 ? t2 : "" + Array(e2 + 1 - r2.length).join(n2) + t2;
      }, v = { s: m, z: function(t2) {
        var e2 = -t2.utcOffset(), n2 = Math.abs(e2), r2 = Math.floor(n2 / 60), i2 = n2 % 60;
        return (e2 <= 0 ? "+" : "-") + m(r2, 2, "0") + ":" + m(i2, 2, "0");
      }, m: function t2(e2, n2) {
        if (e2.date() < n2.date()) return -t2(n2, e2);
        var r2 = 12 * (n2.year() - e2.year()) + (n2.month() - e2.month()), i2 = e2.clone().add(r2, c), s2 = n2 - i2 < 0, u2 = e2.clone().add(r2 + (s2 ? -1 : 1), c);
        return +(-(r2 + (n2 - i2) / (s2 ? i2 - u2 : u2 - i2)) || 0);
      }, a: function(t2) {
        return t2 < 0 ? Math.ceil(t2) || 0 : Math.floor(t2);
      }, p: function(t2) {
        return { M: c, y: h, w: o, d: a, D: d, h: u, m: s, s: i, ms: r, Q: f }[t2] || String(t2 || "").toLowerCase().replace(/s$/, "");
      }, u: function(t2) {
        return void 0 === t2;
      } }, g = "en", D2 = {};
      D2[g] = M2;
      var p = "$isDayjsObject", S = function(t2) {
        return t2 instanceof _ || !(!t2 || !t2[p]);
      }, w = function t2(e2, n2, r2) {
        var i2;
        if (!e2) return g;
        if ("string" == typeof e2) {
          var s2 = e2.toLowerCase();
          D2[s2] && (i2 = s2), n2 && (D2[s2] = n2, i2 = s2);
          var u2 = e2.split("-");
          if (!i2 && u2.length > 1) return t2(u2[0]);
        } else {
          var a2 = e2.name;
          D2[a2] = e2, i2 = a2;
        }
        return !r2 && i2 && (g = i2), i2 || !r2 && g;
      }, O = function(t2, e2) {
        if (S(t2)) return t2.clone();
        var n2 = "object" == typeof e2 ? e2 : {};
        return n2.date = t2, n2.args = arguments, new _(n2);
      }, b = v;
      b.l = w, b.i = S, b.w = function(t2, e2) {
        return O(t2, { locale: e2.$L, utc: e2.$u, x: e2.$x, $offset: e2.$offset });
      };
      var _ = function() {
        function M3(t2) {
          this.$L = w(t2.locale, null, true), this.parse(t2), this.$x = this.$x || t2.x || {}, this[p] = true;
        }
        var m2 = M3.prototype;
        return m2.parse = function(t2) {
          this.$d = function(t3) {
            var e2 = t3.date, n2 = t3.utc;
            if (null === e2) return /* @__PURE__ */ new Date(NaN);
            if (b.u(e2)) return /* @__PURE__ */ new Date();
            if (e2 instanceof Date) return new Date(e2);
            if ("string" == typeof e2 && !/Z$/i.test(e2)) {
              var r2 = e2.match($);
              if (r2) {
                var i2 = r2[2] - 1 || 0, s2 = (r2[7] || "0").substring(0, 3);
                return n2 ? new Date(Date.UTC(r2[1], i2, r2[3] || 1, r2[4] || 0, r2[5] || 0, r2[6] || 0, s2)) : new Date(r2[1], i2, r2[3] || 1, r2[4] || 0, r2[5] || 0, r2[6] || 0, s2);
              }
            }
            return new Date(e2);
          }(t2), this.init();
        }, m2.init = function() {
          var t2 = this.$d;
          this.$y = t2.getFullYear(), this.$M = t2.getMonth(), this.$D = t2.getDate(), this.$W = t2.getDay(), this.$H = t2.getHours(), this.$m = t2.getMinutes(), this.$s = t2.getSeconds(), this.$ms = t2.getMilliseconds();
        }, m2.$utils = function() {
          return b;
        }, m2.isValid = function() {
          return !(this.$d.toString() === l);
        }, m2.isSame = function(t2, e2) {
          var n2 = O(t2);
          return this.startOf(e2) <= n2 && n2 <= this.endOf(e2);
        }, m2.isAfter = function(t2, e2) {
          return O(t2) < this.startOf(e2);
        }, m2.isBefore = function(t2, e2) {
          return this.endOf(e2) < O(t2);
        }, m2.$g = function(t2, e2, n2) {
          return b.u(t2) ? this[e2] : this.set(n2, t2);
        }, m2.unix = function() {
          return Math.floor(this.valueOf() / 1e3);
        }, m2.valueOf = function() {
          return this.$d.getTime();
        }, m2.startOf = function(t2, e2) {
          var n2 = this, r2 = !!b.u(e2) || e2, f2 = b.p(t2), l2 = function(t3, e3) {
            var i2 = b.w(n2.$u ? Date.UTC(n2.$y, e3, t3) : new Date(n2.$y, e3, t3), n2);
            return r2 ? i2 : i2.endOf(a);
          }, $2 = function(t3, e3) {
            return b.w(n2.toDate()[t3].apply(n2.toDate("s"), (r2 ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(e3)), n2);
          }, y2 = this.$W, M4 = this.$M, m3 = this.$D, v2 = "set" + (this.$u ? "UTC" : "");
          switch (f2) {
            case h:
              return r2 ? l2(1, 0) : l2(31, 11);
            case c:
              return r2 ? l2(1, M4) : l2(0, M4 + 1);
            case o:
              var g2 = this.$locale().weekStart || 0, D3 = (y2 < g2 ? y2 + 7 : y2) - g2;
              return l2(r2 ? m3 - D3 : m3 + (6 - D3), M4);
            case a:
            case d:
              return $2(v2 + "Hours", 0);
            case u:
              return $2(v2 + "Minutes", 1);
            case s:
              return $2(v2 + "Seconds", 2);
            case i:
              return $2(v2 + "Milliseconds", 3);
            default:
              return this.clone();
          }
        }, m2.endOf = function(t2) {
          return this.startOf(t2, false);
        }, m2.$set = function(t2, e2) {
          var n2, o2 = b.p(t2), f2 = "set" + (this.$u ? "UTC" : ""), l2 = (n2 = {}, n2[a] = f2 + "Date", n2[d] = f2 + "Date", n2[c] = f2 + "Month", n2[h] = f2 + "FullYear", n2[u] = f2 + "Hours", n2[s] = f2 + "Minutes", n2[i] = f2 + "Seconds", n2[r] = f2 + "Milliseconds", n2)[o2], $2 = o2 === a ? this.$D + (e2 - this.$W) : e2;
          if (o2 === c || o2 === h) {
            var y2 = this.clone().set(d, 1);
            y2.$d[l2]($2), y2.init(), this.$d = y2.set(d, Math.min(this.$D, y2.daysInMonth())).$d;
          } else l2 && this.$d[l2]($2);
          return this.init(), this;
        }, m2.set = function(t2, e2) {
          return this.clone().$set(t2, e2);
        }, m2.get = function(t2) {
          return this[b.p(t2)]();
        }, m2.add = function(r2, f2) {
          var d2, l2 = this;
          r2 = Number(r2);
          var $2 = b.p(f2), y2 = function(t2) {
            var e2 = O(l2);
            return b.w(e2.date(e2.date() + Math.round(t2 * r2)), l2);
          };
          if ($2 === c) return this.set(c, this.$M + r2);
          if ($2 === h) return this.set(h, this.$y + r2);
          if ($2 === a) return y2(1);
          if ($2 === o) return y2(7);
          var M4 = (d2 = {}, d2[s] = e, d2[u] = n, d2[i] = t, d2)[$2] || 1, m3 = this.$d.getTime() + r2 * M4;
          return b.w(m3, this);
        }, m2.subtract = function(t2, e2) {
          return this.add(-1 * t2, e2);
        }, m2.format = function(t2) {
          var e2 = this, n2 = this.$locale();
          if (!this.isValid()) return n2.invalidDate || l;
          var r2 = t2 || "YYYY-MM-DDTHH:mm:ssZ", i2 = b.z(this), s2 = this.$H, u2 = this.$m, a2 = this.$M, o2 = n2.weekdays, c2 = n2.months, f2 = n2.meridiem, h2 = function(t3, n3, i3, s3) {
            return t3 && (t3[n3] || t3(e2, r2)) || i3[n3].slice(0, s3);
          }, d2 = function(t3) {
            return b.s(s2 % 12 || 12, t3, "0");
          }, $2 = f2 || function(t3, e3, n3) {
            var r3 = t3 < 12 ? "AM" : "PM";
            return n3 ? r3.toLowerCase() : r3;
          };
          return r2.replace(y, function(t3, r3) {
            return r3 || function(t4) {
              switch (t4) {
                case "YY":
                  return String(e2.$y).slice(-2);
                case "YYYY":
                  return b.s(e2.$y, 4, "0");
                case "M":
                  return a2 + 1;
                case "MM":
                  return b.s(a2 + 1, 2, "0");
                case "MMM":
                  return h2(n2.monthsShort, a2, c2, 3);
                case "MMMM":
                  return h2(c2, a2);
                case "D":
                  return e2.$D;
                case "DD":
                  return b.s(e2.$D, 2, "0");
                case "d":
                  return String(e2.$W);
                case "dd":
                  return h2(n2.weekdaysMin, e2.$W, o2, 2);
                case "ddd":
                  return h2(n2.weekdaysShort, e2.$W, o2, 3);
                case "dddd":
                  return o2[e2.$W];
                case "H":
                  return String(s2);
                case "HH":
                  return b.s(s2, 2, "0");
                case "h":
                  return d2(1);
                case "hh":
                  return d2(2);
                case "a":
                  return $2(s2, u2, true);
                case "A":
                  return $2(s2, u2, false);
                case "m":
                  return String(u2);
                case "mm":
                  return b.s(u2, 2, "0");
                case "s":
                  return String(e2.$s);
                case "ss":
                  return b.s(e2.$s, 2, "0");
                case "SSS":
                  return b.s(e2.$ms, 3, "0");
                case "Z":
                  return i2;
              }
              return null;
            }(t3) || i2.replace(":", "");
          });
        }, m2.utcOffset = function() {
          return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
        }, m2.diff = function(r2, d2, l2) {
          var $2, y2 = this, M4 = b.p(d2), m3 = O(r2), v2 = (m3.utcOffset() - this.utcOffset()) * e, g2 = this - m3, D3 = function() {
            return b.m(y2, m3);
          };
          switch (M4) {
            case h:
              $2 = D3() / 12;
              break;
            case c:
              $2 = D3();
              break;
            case f:
              $2 = D3() / 3;
              break;
            case o:
              $2 = (g2 - v2) / 6048e5;
              break;
            case a:
              $2 = (g2 - v2) / 864e5;
              break;
            case u:
              $2 = g2 / n;
              break;
            case s:
              $2 = g2 / e;
              break;
            case i:
              $2 = g2 / t;
              break;
            default:
              $2 = g2;
          }
          return l2 ? $2 : b.a($2);
        }, m2.daysInMonth = function() {
          return this.endOf(c).$D;
        }, m2.$locale = function() {
          return D2[this.$L];
        }, m2.locale = function(t2, e2) {
          if (!t2) return this.$L;
          var n2 = this.clone(), r2 = w(t2, e2, true);
          return r2 && (n2.$L = r2), n2;
        }, m2.clone = function() {
          return b.w(this.$d, this);
        }, m2.toDate = function() {
          return new Date(this.valueOf());
        }, m2.toJSON = function() {
          return this.isValid() ? this.toISOString() : null;
        }, m2.toISOString = function() {
          return this.$d.toISOString();
        }, m2.toString = function() {
          return this.$d.toUTCString();
        }, M3;
      }(), k = _.prototype;
      return O.prototype = k, [["$ms", r], ["$s", i], ["$m", s], ["$H", u], ["$W", a], ["$M", c], ["$y", h], ["$D", d]].forEach(function(t2) {
        k[t2[1]] = function(e2) {
          return this.$g(e2, t2[0], t2[1]);
        };
      }), O.extend = function(t2, e2) {
        return t2.$i || (t2(e2, _, O), t2.$i = true), O;
      }, O.locale = w, O.isDayjs = S, O.unix = function(t2) {
        return O(1e3 * t2);
      }, O.en = D2[g], O.Ls = D2, O.p = {}, O;
    });
  }
});

// node_modules/dayjs/locale/fa.js
var require_fa = __commonJS({
  "node_modules/dayjs/locale/fa.js"(exports, module) {
    !function(_, e) {
      "object" == typeof exports && "undefined" != typeof module ? module.exports = e(require_dayjs_min()) : "function" == typeof define && define.amd ? define(["dayjs"], e) : (_ = "undefined" != typeof globalThis ? globalThis : _ || self).dayjs_locale_fa = e(_.dayjs);
    }(exports, function(_) {
      "use strict";
      function e(_2) {
        return _2 && "object" == typeof _2 && "default" in _2 ? _2 : { default: _2 };
      }
      var t = e(_), d = { name: "fa", weekdays: "\u06CC\u06A9\u200C\u0634\u0646\u0628\u0647_\u062F\u0648\u0634\u0646\u0628\u0647_\u0633\u0647\u200C\u0634\u0646\u0628\u0647_\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647_\u067E\u0646\u062C\u200C\u0634\u0646\u0628\u0647_\u062C\u0645\u0639\u0647_\u0634\u0646\u0628\u0647".split("_"), weekdaysShort: "\u06CC\u06A9\u200C\u0634\u0646\u0628\u0647_\u062F\u0648\u0634\u0646\u0628\u0647_\u0633\u0647\u200C\u0634\u0646\u0628\u0647_\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647_\u067E\u0646\u062C\u200C\u0634\u0646\u0628\u0647_\u062C\u0645\u0639\u0647_\u0634\u0646\u0628\u0647".split("_"), weekdaysMin: "\u06CC_\u062F_\u0633_\u0686_\u067E_\u062C_\u0634".split("_"), weekStart: 6, months: "\u0698\u0627\u0646\u0648\u06CC\u0647_\u0641\u0648\u0631\u06CC\u0647_\u0645\u0627\u0631\u0633_\u0622\u0648\u0631\u06CC\u0644_\u0645\u0647_\u0698\u0648\u0626\u0646_\u0698\u0648\u0626\u06CC\u0647_\u0627\u0648\u062A_\u0633\u067E\u062A\u0627\u0645\u0628\u0631_\u0627\u06A9\u062A\u0628\u0631_\u0646\u0648\u0627\u0645\u0628\u0631_\u062F\u0633\u0627\u0645\u0628\u0631".split("_"), monthsShort: "\u0698\u0627\u0646\u0648\u06CC\u0647_\u0641\u0648\u0631\u06CC\u0647_\u0645\u0627\u0631\u0633_\u0622\u0648\u0631\u06CC\u0644_\u0645\u0647_\u0698\u0648\u0626\u0646_\u0698\u0648\u0626\u06CC\u0647_\u0627\u0648\u062A_\u0633\u067E\u062A\u0627\u0645\u0628\u0631_\u0627\u06A9\u062A\u0628\u0631_\u0646\u0648\u0627\u0645\u0628\u0631_\u062F\u0633\u0627\u0645\u0628\u0631".split("_"), ordinal: function(_2) {
        return _2;
      }, formats: { LT: "HH:mm", LTS: "HH:mm:ss", L: "DD/MM/YYYY", LL: "D MMMM YYYY", LLL: "D MMMM YYYY HH:mm", LLLL: "dddd, D MMMM YYYY HH:mm" }, relativeTime: { future: "\u062F\u0631 %s", past: "%s \u067E\u06CC\u0634", s: "\u0686\u0646\u062F \u062B\u0627\u0646\u06CC\u0647", m: "\u06CC\u06A9 \u062F\u0642\u06CC\u0642\u0647", mm: "%d \u062F\u0642\u06CC\u0642\u0647", h: "\u06CC\u06A9 \u0633\u0627\u0639\u062A", hh: "%d \u0633\u0627\u0639\u062A", d: "\u06CC\u06A9 \u0631\u0648\u0632", dd: "%d \u0631\u0648\u0632", M: "\u06CC\u06A9 \u0645\u0627\u0647", MM: "%d \u0645\u0627\u0647", y: "\u06CC\u06A9 \u0633\u0627\u0644", yy: "%d \u0633\u0627\u0644" } };
      return t.default.locale(d, null, true), d;
    });
  }
});

// node_modules/dayjs/plugin/utc.js
var require_utc = __commonJS({
  "node_modules/dayjs/plugin/utc.js"(exports, module) {
    !function(t, i) {
      "object" == typeof exports && "undefined" != typeof module ? module.exports = i() : "function" == typeof define && define.amd ? define(i) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs_plugin_utc = i();
    }(exports, function() {
      "use strict";
      var t = "minute", i = /[+-]\d\d(?::?\d\d)?/g, e = /([+-]|\d\d)/g;
      return function(s, f, n) {
        var u = f.prototype;
        n.utc = function(t2) {
          var i2 = { date: t2, utc: true, args: arguments };
          return new f(i2);
        }, u.utc = function(i2) {
          var e2 = n(this.toDate(), { locale: this.$L, utc: true });
          return i2 ? e2.add(this.utcOffset(), t) : e2;
        }, u.local = function() {
          return n(this.toDate(), { locale: this.$L, utc: false });
        };
        var o = u.parse;
        u.parse = function(t2) {
          t2.utc && (this.$u = true), this.$utils().u(t2.$offset) || (this.$offset = t2.$offset), o.call(this, t2);
        };
        var r = u.init;
        u.init = function() {
          if (this.$u) {
            var t2 = this.$d;
            this.$y = t2.getUTCFullYear(), this.$M = t2.getUTCMonth(), this.$D = t2.getUTCDate(), this.$W = t2.getUTCDay(), this.$H = t2.getUTCHours(), this.$m = t2.getUTCMinutes(), this.$s = t2.getUTCSeconds(), this.$ms = t2.getUTCMilliseconds();
          } else r.call(this);
        };
        var a = u.utcOffset;
        u.utcOffset = function(s2, f2) {
          var n2 = this.$utils().u;
          if (n2(s2)) return this.$u ? 0 : n2(this.$offset) ? a.call(this) : this.$offset;
          if ("string" == typeof s2 && (s2 = function(t2) {
            void 0 === t2 && (t2 = "");
            var s3 = t2.match(i);
            if (!s3) return null;
            var f3 = ("" + s3[0]).match(e) || ["-", 0, 0], n3 = f3[0], u3 = 60 * +f3[1] + +f3[2];
            return 0 === u3 ? 0 : "+" === n3 ? u3 : -u3;
          }(s2), null === s2)) return this;
          var u2 = Math.abs(s2) <= 16 ? 60 * s2 : s2, o2 = this;
          if (f2) return o2.$offset = u2, o2.$u = 0 === s2, o2;
          if (0 !== s2) {
            var r2 = this.$u ? this.toDate().getTimezoneOffset() : -1 * this.utcOffset();
            (o2 = this.local().add(u2 + r2, t)).$offset = u2, o2.$x.$localOffset = r2;
          } else o2 = this.utc();
          return o2;
        };
        var h = u.format;
        u.format = function(t2) {
          var i2 = t2 || (this.$u ? "YYYY-MM-DDTHH:mm:ss[Z]" : "");
          return h.call(this, i2);
        }, u.valueOf = function() {
          var t2 = this.$utils().u(this.$offset) ? 0 : this.$offset + (this.$x.$localOffset || this.$d.getTimezoneOffset());
          return this.$d.valueOf() - 6e4 * t2;
        }, u.isUTC = function() {
          return !!this.$u;
        }, u.toISOString = function() {
          return this.toDate().toISOString();
        }, u.toString = function() {
          return this.toDate().toUTCString();
        };
        var l = u.toDate;
        u.toDate = function(t2) {
          return "s" === t2 && this.$offset ? n(this.format("YYYY-MM-DD HH:mm:ss:SSS")).toDate() : l.call(this);
        };
        var c = u.diff;
        u.diff = function(t2, i2, e2) {
          if (t2 && this.$u === t2.$u) return c.call(this, t2, i2, e2);
          var s2 = this.local(), f2 = n(t2).local();
          return c.call(s2, f2, i2, e2);
        };
      };
    });
  }
});

// shared/core.js
var import_dayjs = __toESM(require_dayjs_min(), 1);

// node_modules/jalaliday/dist/jalaliday.esm.js
var import_fa = __toESM(require_fa());
function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest();
}
function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}
function _iterableToArrayLimit(arr, i) {
  var _arr = [];
  var _n = true;
  var _d = false;
  var _e = void 0;
  try {
    for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
      _arr.push(_s.value);
      if (i && _arr.length === i) break;
    }
  } catch (err) {
    _d = true;
    _e = err;
  } finally {
    try {
      if (!_n && _i["return"] != null) _i["return"]();
    } finally {
      if (_d) throw _e;
    }
  }
  return _arr;
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance");
}
var $floor = Math.floor;
function mod(a, b) {
  return a - b * $floor(a / b);
}
function lg(year) {
  return year % 4 == 0 && !(year % 100 == 0 && year % 400 != 0);
}
var GE = 17214255e-1;
function g2j(year, month, day) {
  return GE - 1 + 365 * (year - 1) + $floor((year - 1) / 4) + -$floor((year - 1) / 100) + $floor((year - 1) / 400) + $floor((367 * month - 362) / 12 + (month <= 2 ? 0 : lg(year) ? -1 : -2) + day);
}
function j2g(jd) {
  var wjd, depoch, quadricent, dqc, cent, dcent, quad, dquad, yindex, year, yearday, leapadj;
  wjd = $floor(jd - 0.5) + 0.5;
  depoch = wjd - GE;
  quadricent = $floor(depoch / 146097);
  dqc = mod(depoch, 146097);
  cent = $floor(dqc / 36524);
  dcent = mod(dqc, 36524);
  quad = $floor(dcent / 1461);
  dquad = mod(dcent, 1461);
  yindex = $floor(dquad / 365);
  year = quadricent * 400 + cent * 100 + quad * 4 + yindex;
  if (!(cent == 4 || yindex == 4)) {
    year++;
  }
  yearday = wjd - g2j(year, 1, 1);
  leapadj = wjd < g2j(year, 3, 1) ? 0 : lg(year) ? 1 : 2;
  var month = $floor(((yearday + leapadj) * 12 + 373) / 367), day = wjd - g2j(year, month, 1) + 1;
  return [year, month, day];
}
var PE = 19483205e-1;
function p2j(year, month, day) {
  var epbase, epyear;
  epbase = year - (year >= 0 ? 474 : 473);
  epyear = 474 + mod(epbase, 2820);
  return day + (month <= 7 ? (month - 1) * 31 : (month - 1) * 30 + 6) + $floor((epyear * 682 - 110) / 2816) + (epyear - 1) * 365 + $floor(epbase / 2820) * 1029983 + (PE - 1);
}
function j2p(jd) {
  var year, month, day, depoch, cycle, cyear, ycycle, aux1, aux2, yday;
  jd = $floor(jd) + 0.5;
  depoch = jd - p2j(475, 1, 1);
  cycle = $floor(depoch / 1029983);
  cyear = mod(depoch, 1029983);
  if (cyear == 1029982) {
    ycycle = 2820;
  } else {
    aux1 = $floor(cyear / 366);
    aux2 = mod(cyear, 366);
    ycycle = $floor((2134 * aux1 + 2816 * aux2 + 2815) / 1028522) + aux1 + 1;
  }
  year = ycycle + 2820 * cycle + 474;
  if (year <= 0) {
    year--;
  }
  yday = jd - p2j(year, 1, 1) + 1;
  month = yday <= 186 ? Math.ceil(yday / 31) : Math.ceil((yday - 6) / 30);
  day = jd - p2j(year, month, 1) + 1;
  return [year, month, day];
}
var jdate = {
  J: function J(y, m, d) {
    return j2p(g2j(y, m, d));
  },
  G: function G(y, m, d) {
    return j2g(p2j(y, m, d));
  }
};
var REGEX_PARSE = /^(\d{4})[-/]?(\d{1,2})[-/]?(\d{0,2})(.*)?$/;
var REGEX_FORMAT = /\[.*?\]|jY{2,4}|jM{1,4}|jD{1,2}|Y{2,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g;
var DATE = "date";
var D = "day";
var M = "month";
var Y = "year";
var W = "week";
var FORMAT_DEFAULT = "YYYY-MM-DDTHH:mm:ssZ";
var fa = {
  jmonths: "\u0641\u0631\u0648\u0631\u062F\u06CC\u0646_\u0627\u0631\u062F\u06CC\u0628\u0647\u0634\u062A_\u062E\u0631\u062F\u0627\u062F_\u062A\u06CC\u0631_\u0645\u0631\u062F\u0627\u062F_\u0634\u0647\u0631\u06CC\u0648\u0631_\u0645\u0647\u0631_\u0622\u0628\u0627\u0646_\u0622\u0630\u0631_\u062F\u06CC_\u0628\u0647\u0645\u0646_\u0627\u0633\u0641\u0646\u062F".split("_")
};
var plugin = function(o, Dayjs, dayjs2) {
  var proto = Dayjs.prototype;
  var U = proto.$utils();
  var $isJalali = function $isJalali2(v) {
    return v.$C === "jalali";
  };
  var $prettyUnit = U.prettyUnit || U.p;
  var $isUndefined = U.isUndefined || U.u;
  var $padStart = U.padStart || U.s;
  var $monthDiff = U.monthDiff || U.m;
  var $absFloor = U.absFloor || U.a;
  var wrapperOfTruth = function wrapperOfTruth2(action) {
    return function() {
      var unsure = action.bind(this).apply(void 0, arguments);
      unsure.$C = this.$C;
      if (unsure.isJalali()) {
        unsure.InitJalali();
      }
      return unsure;
    };
  };
  proto.startOf = wrapperOfTruth(proto.startOf);
  proto.endOf = wrapperOfTruth(proto.endOf);
  proto.add = wrapperOfTruth(proto.add);
  proto.subtract = wrapperOfTruth(proto.subtract);
  proto.set = wrapperOfTruth(proto.set);
  var oldParse = proto.parse;
  var oldInit = proto.init;
  var oldStartOf = proto.startOf;
  var old$Set = proto.$set;
  var oldAdd = proto.add;
  var oldFormat = proto.format;
  var oldDiff = proto.diff;
  var oldYear = proto.year;
  var oldMonth = proto.month;
  var oldDate = proto.date;
  var oldDaysInMonth = proto.daysInMonth;
  var oldToArray = proto.toArray;
  dayjs2.$C = "gregory";
  dayjs2.$fdow = 6;
  dayjs2.calendar = function(calendar) {
    dayjs2.$C = calendar;
    return dayjs2;
  };
  proto.calendar = function(calendar) {
    var that = this.clone();
    that.$C = calendar;
    if (that.isJalali()) {
      that.InitJalali();
    }
    return that;
  };
  proto.isJalali = function() {
    return $isJalali(this);
  };
  dayjs2.en.jmonths = "Farvardin_Ordibehesht_Khordaad_Tir_Mordaad_Shahrivar_Mehr_Aabaan_Aazar_Dey_Bahman_Esfand".split("_");
  dayjs2.locale("fa", Object.assign({}, import_fa.default, {}, fa), true);
  var wrapper = function wrapper2(date, instance) {
    return dayjs2(date, {
      locale: instance.$L,
      utc: instance.$u,
      calendar: instance.$C
    });
  };
  proto.init = function() {
    var cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    oldInit.bind(this)(cfg);
    if (this.isJalali()) {
      this.InitJalali();
    }
  };
  proto.parse = function(cfg) {
    var reg;
    this.$C = cfg.calendar || this.$C || dayjs2.$C;
    if (cfg.jalali && typeof cfg.date === "string" && /.*[^Z]$/i.test(cfg.date) && (reg = cfg.date.match(REGEX_PARSE))) {
      var _jdate$G = jdate.G(parseInt(reg[1], 10), parseInt(reg[2], 10), parseInt(reg[3] || 1, 10)), _jdate$G2 = _slicedToArray(_jdate$G, 3), y = _jdate$G2[0], m = _jdate$G2[1], d = _jdate$G2[2];
      cfg.date = "".concat(y, "-").concat(m, "-").concat(d).concat(reg[4] || "");
    }
    return oldParse.bind(this)(cfg);
  };
  proto.InitJalali = function() {
    var _jdate$J = jdate.J(this.$y, this.$M + 1, this.$D), _jdate$J2 = _slicedToArray(_jdate$J, 3), jy = _jdate$J2[0], jm = _jdate$J2[1], jd = _jdate$J2[2];
    this.$jy = jy;
    this.$jM = jm - 1;
    this.$jD = jd;
  };
  proto.startOf = function(units, startOf) {
    var _this = this;
    if (!$isJalali(this)) {
      return oldStartOf.bind(this)(units, startOf);
    }
    var isStartOf = !$isUndefined(startOf) ? startOf : true;
    var unit = $prettyUnit(units);
    var instanceFactory = function instanceFactory2(d, m) {
      var y = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : _this.$jy;
      var _jdate$G3 = jdate.G(y, m + 1, d), _jdate$G4 = _slicedToArray(_jdate$G3, 3), gy = _jdate$G4[0], gm = _jdate$G4[1], gd = _jdate$G4[2];
      var ins = wrapper(new Date(gy, gm - 1, gd), _this);
      return (isStartOf ? ins : ins.endOf(D)).$set("hour", 1);
    };
    var WModifier = (this.$W + (7 - dayjs2.$fdow)) % 7;
    switch (unit) {
      case Y:
        return isStartOf ? instanceFactory(1, 0) : instanceFactory(0, 0, this.$jy + 1);
      case M:
        return isStartOf ? instanceFactory(1, this.$jM) : instanceFactory(0, (this.$jM + 1) % 12, this.$jy + parseInt((this.$jM + 1) / 12, 10));
      case W:
        return isStartOf ? instanceFactory(this.$jD - WModifier, this.$jM) : instanceFactory(this.$jD + (6 - WModifier), this.$jM);
      default:
        return oldStartOf.bind(this)(units, startOf);
    }
  };
  proto.$set = function(units, _int) {
    var _this2 = this;
    if (!$isJalali(this)) {
      return old$Set.bind(this)(units, _int);
    }
    var unit = $prettyUnit(units);
    var instanceFactory = function instanceFactory2(d, m) {
      var y = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : _this2.$jy;
      var _jdate$G5 = jdate.G(y, m + 1, d), _jdate$G6 = _slicedToArray(_jdate$G5, 3), gy = _jdate$G6[0], gm = _jdate$G6[1], gd = _jdate$G6[2];
      _this2.$d.setFullYear(gy);
      _this2.$d.setMonth(gm - 1);
      _this2.$d.setDate(gd);
      return _this2;
    };
    switch (unit) {
      case DATE:
      case D:
        instanceFactory(_int, this.$jM);
        break;
      case M:
        instanceFactory(this.$jD, _int);
        break;
      case Y:
        instanceFactory(this.$jD, this.$jM, _int);
        break;
      default:
        return old$Set.bind(this)(units, _int);
    }
    this.init();
    return this;
  };
  proto.add = function(number, units) {
    var _this3 = this;
    if (!$isJalali(this)) {
      return oldAdd.bind(this)(number, units);
    }
    number = Number(number);
    var unit = units && (units.length === 1 || units === "ms") ? units : $prettyUnit(units);
    var instanceFactory = function instanceFactory2(u, n2) {
      var date2 = _this3.set(DATE, 1).set(u, n2 + number);
      return date2.set(DATE, Math.min(_this3.$jD, date2.daysInMonth()));
    };
    if (["M", M].indexOf(unit) > -1) {
      var n = this.$jM + number;
      var y = n < 0 ? -Math.ceil(-n / 12) : parseInt(n / 12, 10);
      var d = this.$jD;
      var x = this.set(D, 1).add(y, Y).set(M, n - y * 12);
      return x.set(D, Math.min(x.daysInMonth(), d));
    }
    if (["y", Y].indexOf(unit) > -1) {
      return instanceFactory(Y, this.$jy);
    }
    if (["d", D].indexOf(unit) > -1) {
      var date = new Date(this.$d);
      date.setDate(date.getDate() + number);
      return wrapper(date, this);
    }
    return oldAdd.bind(this)(number, units);
  };
  proto.format = function(formatStr, localeObject) {
    var _this4 = this;
    if (!$isJalali(this)) {
      return oldFormat.bind(this)(formatStr, localeObject);
    }
    var str = formatStr || FORMAT_DEFAULT;
    var locale = localeObject || this.$locale();
    var jmonths = locale.jmonths;
    return str.replace(REGEX_FORMAT, function(match) {
      if (match.indexOf("[") > -1) return match.replace(/\[|\]/g, "");
      switch (match) {
        case "YY":
          return String(_this4.$jy).slice(-2);
        case "YYYY":
          return String(_this4.$jy);
        case "M":
          return String(_this4.$jM + 1);
        case "MM":
          return $padStart(_this4.$jM + 1, 2, "0");
        case "MMM":
          return jmonths[_this4.$jM].slice(0, 3);
        case "MMMM":
          return jmonths[_this4.$jM];
        case "D":
          return String(_this4.$jD);
        case "DD":
          return $padStart(_this4.$jD, 2, "0");
        default:
          return oldFormat.bind(_this4)(match, localeObject);
      }
    });
  };
  proto.diff = function(input, units, _float) {
    if (!$isJalali(this)) {
      return oldDiff.bind(this)(input, units, _float);
    }
    var unit = $prettyUnit(units);
    var that = dayjs2(input);
    var result = $monthDiff(this, that);
    switch (unit) {
      case Y:
        result /= 12;
        break;
      case M:
        break;
      default:
        return oldDiff.bind(this)(input, units, _float);
    }
    return _float ? result : $absFloor(result);
  };
  proto.$g = function(input, get, set) {
    if ($isUndefined(input)) return this[get];
    return this.set(set, input);
  };
  proto.year = function(input) {
    if (!$isJalali(this)) {
      return oldYear.bind(this)(input);
    }
    return this.$g(input, "$jy", Y);
  };
  proto.month = function(input) {
    if (!$isJalali(this)) {
      return oldMonth.bind(this)(input);
    }
    return this.$g(input, "$jM", M);
  };
  proto.date = function(input) {
    if (!$isJalali(this)) {
      return oldDate.bind(this)(input);
    }
    return this.$g(input, "$jD", D);
  };
  proto.daysInMonth = function() {
    if (!$isJalali(this)) {
      return oldDaysInMonth.bind(this)();
    }
    return this.endOf(M).$jD;
  };
  if (oldToArray) {
    proto.toArray = function() {
      if (!$isJalali(this)) {
        return oldToArray.bind(this)();
      }
      return [this.$jy, this.$jM, this.$jD, this.$H, this.$m, this.$s, this.$ms];
    };
  }
  proto.clone = function() {
    return wrapper(this.toDate(), this);
  };
};
var jalaliday_esm_default = plugin;

// shared/core.js
var import_utc = __toESM(require_utc(), 1);

// tgcloud/lib/shifts/attendance.js
var toMin = (t) => t == null || t === "" ? null : (([h, m]) => h * 60 + m)(t.split(":").map(Number));
var overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
var cap = (v, c) => c == null ? v : Math.min(v, c);
function segments(day) {
  const segs = [];
  let prevEnd = -Infinity;
  for (const [s, e] of [[day.p1_start, day.p1_end], [day.p2_start, day.p2_end]]) {
    let a = toMin(s), b = toMin(e);
    if (a == null || b == null) continue;
    while (a < prevEnd) {
      a += 1440;
      b += 1440;
    }
    if (b <= a) b += 1440;
    segs.push([a, b]);
    prevEnd = b;
  }
  return segs;
}
function presence(punches, window) {
  const lo = toMin(window?.start) ?? -Infinity;
  let hi = toMin(window?.end) ?? Infinity;
  if (hi < lo) hi += 1440;
  const out = [];
  let prev = -Infinity;
  for (const p of punches) {
    let a = toMin(p.in), b = toMin(p.out);
    if (a == null || b == null) continue;
    while (a < prev) {
      a += 1440;
      b += 1440;
    }
    if (b <= a) b += 1440;
    a = Math.max(a, lo);
    b = Math.min(b, hi);
    if (b > a) out.push([a, b]);
    prev = b;
  }
  return out;
}
var sumOverlap = (pres, a, b) => pres.reduce((s, [x, y]) => s + overlap(x, y, a, b), 0);
var total = (pres) => pres.reduce((s, [a, b]) => s + b - a, 0);
function computeDay(day, punches, rules = {}, ctx = {}) {
  const st = ctx.settings || {};
  const pres = presence(punches, { start: rules.punch_window_start, end: rules.punch_window_end });
  const present = total(pres);
  const r = { required: 0, worked: 0, late: 0, early: 0, absence: 0, overtime: 0, excess: 0, holidayWork: 0 };
  if (ctx.isHoliday && rules.follow_official_holidays || ctx.isFriday && !day) {
    const enabled = ctx.isHoliday ? st.calc_holiday_work : st.calc_friday_work;
    if (enabled) r.holidayWork = present;
    else r.excess = present;
    return r;
  }
  if (!day) {
    r.overtime = cap(present, rules.no_shift_overtime_cap);
    r.excess = present - r.overtime;
    return r;
  }
  if (day.kind === "floating") {
    r.required = day.required_minutes || 0;
    r.worked = Math.min(present, r.required);
    r.absence = r.required - r.worked;
    const extra = present - r.worked;
    r.overtime = cap(extra, rules.daily_overtime_cap);
    r.excess = extra - r.overtime;
    return r;
  }
  let segs = segments(day);
  if (!segs.length) return r;
  r.required = segs.reduce((s, [a, b]) => s + b - a, 0);
  const firstIn = pres.length ? pres[0][0] : null;
  if (firstIn != null) {
    const diff = firstIn - segs[0][0];
    let shift = 0;
    if (diff > 0 && rules.float_minutes) shift = st.apply_float_over_limit ? Math.min(diff, rules.float_minutes) : diff <= rules.float_minutes ? diff : 0;
    if (diff < 0 && rules.float_before) shift = -Math.min(-diff, rules.float_before);
    if (shift) segs = segs.map(([a, b]) => [a + shift, b + shift]);
  }
  const start = segs[0][0], end = segs[segs.length - 1][1];
  const inShift = segs.reduce((s, [a, b]) => s + sumOverlap(pres, a, b), 0);
  const lastOut = pres.length ? pres[pres.length - 1][1] : null;
  r.late = firstIn == null ? 0 : Math.max(0, Math.min(firstIn, end) - start);
  r.early = lastOut == null ? 0 : Math.max(0, end - Math.max(lastOut, start));
  let forgiven = 0;
  if (r.late && rules.late_grace && r.late <= rules.late_grace) {
    forgiven += r.late;
    r.late = 0;
  }
  if (r.early && rules.early_grace && r.early <= rules.early_grace) {
    forgiven += r.early;
    r.early = 0;
  }
  r.worked = inShift + (st.add_grace_to_worktime !== false ? forgiven : 0);
  r.absence = Math.max(0, r.required - inShift - forgiven);
  const before = sumOverlap(pres, -Infinity, start);
  const middle = segs.length > 1 ? sumOverlap(pres, segs[0][1], segs[1][0]) : 0;
  const after = sumOverlap(pres, end, Infinity);
  const ot = cap(before, rules.ot_before) + cap(middle, rules.ot_middle) + cap(after, rules.ot_after);
  r.overtime = cap(ot, rules.daily_overtime_cap);
  r.excess = before + middle + after - r.overtime;
  return r;
}

// shared/core.js
import_dayjs.default.extend(jalaliday_esm_default);
import_dayjs.default.extend(import_utc.default);
var WEEKDAYS = ["\u0634\u0646\u0628\u0647", "\u06CC\u06A9\u200C\u0634\u0646\u0628\u0647", "\u062F\u0648\u0634\u0646\u0628\u0647", "\u0633\u0647\u200C\u0634\u0646\u0628\u0647", "\u0686\u0647\u0627\u0631\u0634\u0646\u0628\u0647", "\u067E\u0646\u062C\u200C\u0634\u0646\u0628\u0647", "\u062C\u0645\u0639\u0647"];
var LEAVE_KINDS = ["\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC", "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u0639\u0644\u0627\u062C\u06CC", "\u0645\u0631\u062E\u0635\u06CC \u0628\u06CC\u200C\u062D\u0642\u0648\u0642"];
var J2 = (s) => (0, import_dayjs.default)(s, { jalali: true });
var fmt = (d) => d.calendar("jalali").locale("fa").format("YYYY/MM/DD");
var toDay = (now) => (0, import_dayjs.default)(now == null ? void 0 : +now).utcOffset(210);
var todayJ = (now) => fmt(toDay(now));
var nowHM = (now) => toDay(now).format("HH:mm");
var isJDate = (s) => typeof s === "string" && /^1[34]\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(s);
var normJ = (s) => {
  if (!s) return s;
  const p = String(s).split("/");
  if (p.length !== 3) return s;
  return `${p[0]}/${p[1].padStart(2, "0")}/${p[2].padStart(2, "0")}`;
};
var weekday = (s) => WEEKDAYS[(J2(s).day() + 1) % 7];
var mins = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
var hm = (m) => {
  const s = m < 0 ? "-" : "";
  m = Math.abs(Math.round(m));
  return `${s}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
function daysBetween(from, to, max = 400) {
  const out = [];
  let d = J2(from);
  const end = J2(to);
  if (!d.isValid() || !end.isValid()) return out;
  for (let i = 0; i < max && !d.isAfter(end); i++) {
    out.push(fmt(d));
    d = d.add(1, "day");
  }
  return out;
}
var byId = (arr, id) => arr.find((x) => x.id === id);
var fullName = (p) => `${p.firstName || ""} ${p.lastName || ""}`.trim();
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toR = (x) => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function checkLocation(workplace, { lat, lng, accuracy, bssid } = {}) {
  if (!workplace) return { ok: false, reason: "\u0645\u062D\u0644 \u06A9\u0627\u0631 \u0628\u0631\u0627\u06CC \u0634\u0645\u0627 \u062A\u0639\u0631\u06CC\u0641 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A" };
  if (workplace.status === "\u063A\u06CC\u0631 \u0641\u0639\u0627\u0644") return { ok: false, reason: "\u0645\u062D\u0644 \u06A9\u0627\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A" };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (bssid && (workplace.wifis || []).some((w) => w.bssid && norm(w.bssid) === norm(bssid))) {
    return { ok: true, method: "wifi" };
  }
  if (lat == null || lng == null) return { ok: false, reason: "\u0645\u0648\u0642\u0639\u06CC\u062A \u0645\u06A9\u0627\u0646\u06CC \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F" };
  if (workplace.lat == null || workplace.lng == null) return { ok: false, reason: "\u0645\u0648\u0642\u0639\u06CC\u062A \u0645\u062D\u0644 \u06A9\u0627\u0631 \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A" };
  const d = distanceMeters(+lat, +lng, +workplace.lat, +workplace.lng);
  const radius = +workplace.radius || 100;
  const tolerance = Math.min(+accuracy || 0, 50);
  if (d <= radius + tolerance) return { ok: true, method: "gps", distance: Math.round(d) };
  return { ok: false, reason: `\u0634\u0645\u0627 ${Math.round(d)} \u0645\u062A\u0631 \u0627\u0632 \u0645\u062D\u0644 \u06A9\u0627\u0631 \u0641\u0627\u0635\u0644\u0647 \u062F\u0627\u0631\u06CC\u062F (\u062D\u062F\u0627\u06A9\u062B\u0631 ${radius} \u0645\u062A\u0631)`, distance: Math.round(d) };
}
function expectedMinutes(D2, person, date) {
  const shift = byId(D2.shifts, person.shift);
  if (!shift) return 0;
  if (shift.advanced) {
    const a = shift.advanced, day = a.days.find((d) => d.date === toG(date));
    return computeDay(day, [], { ...a.rules, ...day?.rules, follow_official_holidays: !!a.follow_official_holidays }, { isHoliday: D2.holidays.some((h) => h.date === date), isFriday: weekday(date) === "\u062C\u0645\u0639\u0647", settings: a.settings }).required;
  }
  const start = person.shiftStart || person.createdAt;
  if (start && date < start) return 0;
  if (person.shiftEnd && date > person.shiftEnd) return 0;
  if (shift.followHolidays !== false && D2.holidays.some((h) => h.date === date)) return 0;
  const key = shift.type === "\u0633\u0641\u0627\u0631\u0634\u06CC" ? String(Number(date.split("/")[2])) : weekday(date);
  const r = shift.days?.[key];
  if (!r) return 0;
  let m = mins(r[1]) - mins(r[0]);
  if (m < 0) m += 24 * 60;
  return m;
}
function shiftWindow(D2, person, date) {
  const shift = byId(D2.shifts, person.shift);
  if (!shift) return null;
  const key = shift.type === "\u0633\u0641\u0627\u0631\u0634\u06CC" ? String(Number(date.split("/")[2])) : weekday(date);
  return shift.days?.[key] || null;
}
var approvedOn = (D2, personId, kinds, date) => D2.requests.some((r) => r.person === personId && r.status === "\u062A\u0627\u06CC\u06CC\u062F \u0634\u062F\u0647" && kinds.includes(r.kind) && !r.fromTime && r.from <= date && (r.to || r.from) >= date);
var reqDays = (D2, personId, kind, dates) => D2.requests.filter((r) => r.person === personId && r.kind === kind && r.status === "\u062A\u0627\u06CC\u06CC\u062F \u0634\u062F\u0647" && !r.fromTime).reduce((s, r) => s + dates.filter((d) => d >= r.from && d <= (r.to || r.from)).length, 0);
var reqHours = (D2, personId, kind, dates) => D2.requests.filter((r) => r.person === personId && r.kind === kind && r.status === "\u062A\u0627\u06CC\u06CC\u062F \u0634\u062F\u0647" && r.fromTime && dates.includes(r.from)).reduce((s, r) => s + Math.max(mins(r.toTime) - mins(r.fromTime), 0), 0);
function dayRow(D2, person, date) {
  const advanced = byId(D2.shifts, person.shift)?.advanced;
  if (advanced) {
    const att2 = D2.attendance.filter((a) => a.person === person.id && a.date === date).sort((a, b) => a.in.localeCompare(b.in)), day = advanced.days.find((d) => d.date === toG(date));
    const r = computeDay(day, att2, { ...advanced.rules, ...day?.rules, no_shift_overtime_cap: advanced.no_shift_overtime_cap, follow_official_holidays: !!advanced.follow_official_holidays }, { isHoliday: D2.holidays.some((h) => h.date === date), isFriday: weekday(date) === "\u062C\u0645\u0639\u0647", settings: advanced.settings });
    const leave = approvedOn(D2, person.id, ["\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC", "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u0639\u0644\u0627\u062C\u06CC", "\u0645\u0627\u0645\u0648\u0631\u06CC\u062A"], date);
    return { date, weekday: weekday(date), worked: r.worked + r.holidayWork, expected: r.required, inShift: r.worked, late: r.late, early: r.early, summary: att2.map((a) => a.in + " \u062A\u0627 " + (a.out || "(\u0646\u0627\u0642\u0635)")).join("\u060C ") || (leave ? "\u0645\u0631\u062E\u0635\u06CC/\u0645\u0627\u0645\u0648\u0631\u06CC\u062A" : "\u2014"), absent: leave ? 0 : r.absence, overtime: r.overtime, excess: r.excess, incomplete: att2.filter((a) => !a.out).length, holiday: D2.holidays.some((h) => h.date === date) };
  }
  const att = D2.attendance.filter((a) => a.person === person.id && a.date === date).sort((a, b) => mins(a.in) - mins(b.in));
  const worked = att.reduce((s, a) => {
    if (!a.out) return s;
    let m = mins(a.out) - mins(a.in);
    if (m < 0) m += 1440;
    return s + m;
  }, 0);
  let expected = expectedMinutes(D2, person, date);
  const onLeave = approvedOn(D2, person.id, [...LEAVE_KINDS, "\u0645\u0627\u0645\u0648\u0631\u06CC\u062A"], date);
  if (onLeave) expected = 0;
  const hourly = D2.requests.filter((r) => r.person === person.id && r.status === "\u062A\u0627\u06CC\u06CC\u062F \u0634\u062F\u0647" && r.fromTime && r.from === date).reduce((s, r) => s + Math.max(mins(r.toTime) - mins(r.fromTime), 0), 0);
  const covered = worked + hourly;
  const win = shiftWindow(D2, person, date);
  const late = win && att[0] && expected ? Math.max(mins(att[0].in) - mins(win[0]), 0) : 0;
  return {
    date,
    weekday: weekday(date),
    worked,
    expected,
    inShift: Math.min(worked, expected),
    late,
    summary: att.map((a) => `${a.in}${a.out ? " \u062A\u0627 " + a.out : " (\u0646\u0627\u0642\u0635)"}`).join("\u060C ") || (onLeave ? "\u0645\u0631\u062E\u0635\u06CC/\u0645\u0627\u0645\u0648\u0631\u06CC\u062A" : "\u2014"),
    absent: Math.max(expected - covered, 0),
    overtime: Math.max(worked - expected, 0),
    incomplete: att.filter((a) => !a.out).length,
    holiday: D2.holidays.some((h) => h.date === date)
  };
}
function performance(D2, person, from, to, { today } = {}) {
  const dates = daysBetween(from, to).filter((d) => !today || d <= today);
  const rows = dates.map((d) => dayRow(D2, person, d));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const overtimeApproved = reqHours(D2, person.id, "\u0627\u0636\u0627\u0641\u0647 \u06A9\u0627\u0631", dates);
  return {
    id: person.id,
    code: person.code,
    name: fullName(person),
    inShift: hm(sum("inShift")),
    absent: hm(sum("absent")),
    overtime: hm(sum("overtime")),
    overtimeApproved: hm(overtimeApproved),
    late: hm(sum("late")),
    mission: reqDays(D2, person.id, "\u0645\u0627\u0645\u0648\u0631\u06CC\u062A", dates),
    earned: reqDays(D2, person.id, "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC", dates),
    earnedHours: hm(reqHours(D2, person.id, "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC", dates)),
    sick: reqDays(D2, person.id, "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u0639\u0644\u0627\u062C\u06CC", dates),
    unpaid: reqDays(D2, person.id, "\u0645\u0631\u062E\u0635\u06CC \u0628\u06CC\u200C\u062D\u0642\u0648\u0642", dates),
    extra: hm(Math.max(sum("worked") - sum("expected"), 0)),
    workDays: rows.filter((r) => r.worked > 0).length,
    incomplete: sum("incomplete"),
    minutes: { worked: sum("worked"), expected: sum("expected"), absent: sum("absent"), overtime: sum("overtime") },
    rows
  };
}
var reqLen = (r, dayMinutes = 450) => r.fromTime ? Math.max(mins(r.toTime) - mins(r.fromTime), 0) / dayMinutes : daysBetween(r.from, r.to || r.from).length;
function leaveUsage(D2, person, year, month) {
  const pol = byId(D2.policies, person.policy) || {};
  const reqs = D2.requests.filter((r) => r.person === person.id && r.kind === "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC" && r.status === "\u062A\u0627\u06CC\u06CC\u062F \u0634\u062F\u0647");
  const y = reqs.filter((r) => r.from.startsWith(String(year)));
  const m = y.filter((r) => Number(r.from.split("/")[1]) === month + 1);
  const yu = +y.reduce((s, r) => s + reqLen(r), 0).toFixed(2);
  const mu = +m.reduce((s, r) => s + reqLen(r), 0).toFixed(2);
  return {
    id: person.id,
    code: person.code,
    name: fullName(person),
    policy: pol.name,
    mu,
    yu,
    mc: m.length,
    yc: y.length,
    mr: +((pol.monthCap ?? 2.5) - mu).toFixed(2),
    yr: +((pol.yearCap ?? 26) - yu).toFixed(2),
    reqs: y
  };
}
function validateRequest(D2, req, { today } = {}) {
  const errors = [];
  const person = byId(D2.personnel, req.person);
  if (!person) return { ok: false, errors: ["\u067E\u0631\u0633\u0646\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F"] };
  if (!req.kind) errors.push("\u0646\u0648\u0639 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A");
  if (!isJDate(req.from)) errors.push("\u062A\u0627\u0631\u06CC\u062E \u0634\u0631\u0648\u0639 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A");
  if (req.to && !isJDate(req.to)) errors.push("\u062A\u0627\u0631\u06CC\u062E \u067E\u0627\u06CC\u0627\u0646 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A");
  if (req.to && req.to < req.from) errors.push("\u062A\u0627\u0631\u06CC\u062E \u067E\u0627\u06CC\u0627\u0646 \u0642\u0628\u0644 \u0627\u0632 \u062A\u0627\u0631\u06CC\u062E \u0634\u0631\u0648\u0639 \u0627\u0633\u062A");
  if (req.fromTime && (!req.toTime || mins(req.toTime) <= mins(req.fromTime))) errors.push("\u0628\u0627\u0632\u0647 \u0633\u0627\u0639\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A");
  if (errors.length) return { ok: false, errors };
  const pol = byId(D2.policies, person.policy);
  if (pol) {
    if (pol.enabled && pol.enabled[req.kind] === false) errors.push(`\u062B\u0628\u062A \xAB${req.kind}\xBB \u062F\u0631 \u0633\u06CC\u0627\u0633\u062A \u06A9\u0627\u0631\u06CC \u0634\u0645\u0627 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A`);
    if (today) {
      const after = pol.after?.[req.kind];
      const before = pol.before?.[req.kind];
      const diff = J2(req.from).diff(J2(today), "day");
      if (after != null && after !== "" && diff < -after) errors.push(`\u0645\u0647\u0644\u062A \u062B\u0628\u062A \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u0627 ${after} \u0631\u0648\u0632 \u0628\u0639\u062F \u0627\u0632 \u062A\u0627\u0631\u06CC\u062E \u0622\u0646 \u0627\u0633\u062A`);
      if (before != null && before !== "" && diff < before && diff >= 0) errors.push(`\u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 ${before} \u0631\u0648\u0632 \u0642\u0628\u0644 \u062B\u0628\u062A \u0634\u0648\u062F`);
    }
    if (req.kind === "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC") {
      const [y, m] = req.from.split("/").map(Number);
      const u = leaveUsage(D2, person, y, m - 1);
      const len = reqLen(req);
      if (pol.yearCap != null && u.yu + len > pol.yearCap && !pol.allowOverYear) errors.push(`\u0627\u0632 \u0633\u0642\u0641 \u0645\u0631\u062E\u0635\u06CC \u0633\u0627\u0644\u0627\u0646\u0647 (${pol.yearCap} \u0631\u0648\u0632) \u0628\u06CC\u0634\u062A\u0631 \u0645\u06CC\u200C\u0634\u0648\u062F\u061B \u0645\u0627\u0646\u062F\u0647: ${u.yr}`);
      if (pol.monthCap != null && u.mu + len > pol.monthCap && !pol.allowOverMonth) errors.push(`\u0627\u0632 \u0633\u0642\u0641 \u0645\u0631\u062E\u0635\u06CC \u0645\u0627\u0647\u0627\u0646\u0647 (${pol.monthCap} \u0631\u0648\u0632) \u0628\u06CC\u0634\u062A\u0631 \u0645\u06CC\u200C\u0634\u0648\u062F\u061B \u0645\u0627\u0646\u062F\u0647: ${u.mr}`);
      if (pol.maxLen && !req.fromTime && len > pol.maxLen) errors.push(`\u062D\u062F\u0627\u06A9\u062B\u0631 \u0637\u0648\u0644 \u0645\u0631\u062E\u0635\u06CC ${pol.maxLen} \u0631\u0648\u0632 \u0627\u0633\u062A`);
      if (pol.minUnit === "\u0631\u0648\u0632\u0627\u0646\u0647" && req.fromTime) errors.push("\u0645\u0631\u062E\u0635\u06CC \u0633\u0627\u0639\u062A\u06CC \u062F\u0631 \u0633\u06CC\u0627\u0633\u062A \u06A9\u0627\u0631\u06CC \u0634\u0645\u0627 \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A");
      if (req.fromTime) {
        const hourly = D2.requests.filter((r) => r.person === person.id && r.kind === "\u0645\u0631\u062E\u0635\u06CC \u0627\u0633\u062A\u062D\u0642\u0627\u0642\u06CC" && r.fromTime && r.status !== "\u0631\u062F \u0634\u062F\u0647");
        if (pol.hourlyYear && hourly.filter((r) => r.from.startsWith(String(y))).length >= pol.hourlyYear) errors.push("\u0633\u0642\u0641 \u062A\u0639\u062F\u0627\u062F \u0645\u0631\u062E\u0635\u06CC \u0633\u0627\u0639\u062A\u06CC \u0633\u0627\u0644\u0627\u0646\u0647 \u067E\u0631 \u0634\u062F\u0647 \u0627\u0633\u062A");
        if (pol.hourlyMonth && hourly.filter((r) => r.from.startsWith(`${y}/${String(m).padStart(2, "0")}`)).length >= pol.hourlyMonth) errors.push("\u0633\u0642\u0641 \u062A\u0639\u062F\u0627\u062F \u0645\u0631\u062E\u0635\u06CC \u0633\u0627\u0639\u062A\u06CC \u0645\u0627\u0647\u0627\u0646\u0647 \u067E\u0631 \u0634\u062F\u0647 \u0627\u0633\u062A");
      }
    }
  }
  if (!req.fromTime) {
    const overlap2 = D2.requests.find((r) => r.id !== req.id && r.person === person.id && r.status !== "\u0631\u062F \u0634\u062F\u0647" && !r.fromTime && r.from <= (req.to || req.from) && (r.to || r.from) >= req.from);
    if (overlap2) errors.push(`\u0628\u0627 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \xAB${overlap2.kind}\xBB \u0627\u0632 ${overlap2.from} \u0647\u0645\u200C\u067E\u0648\u0634\u0627\u0646\u06CC \u062F\u0627\u0631\u062F`);
  }
  return { ok: errors.length === 0, errors };
}
function dashboard(D2, date) {
  const active = D2.personnel.filter((p) => p.status !== "\u063A\u06CC\u0631 \u0641\u0639\u0627\u0644");
  const todays = D2.attendance.filter((a) => a.date === date);
  const present = active.filter((p) => todays.some((a) => a.person === p.id));
  const leave = active.filter((p) => approvedOn(D2, p.id, LEAVE_KINDS, date));
  const mission = active.filter((p) => approvedOn(D2, p.id, ["\u0645\u0627\u0645\u0648\u0631\u06CC\u062A"], date));
  const absent = active.filter((p) => !present.includes(p) && !leave.includes(p) && !mission.includes(p) && expectedMinutes(D2, p, date) > 0);
  return { present, absent, leave, mission };
}
var toG = (j) => J2(normJ(j)).calendar("gregory").format("YYYY-MM-DD");
var toJ = (g) => fmt((0, import_dayjs.default)(String(g).slice(0, 10)));
var ZK_PUNCH = { 0: "\u0648\u0631\u0648\u062F", 1: "\u062E\u0631\u0648\u062C", 2: "\u062E\u0631\u0648\u062C \u0645\u0648\u0642\u062A", 3: "\u0628\u0627\u0632\u06AF\u0634\u062A", 4: "\u0648\u0631\u0648\u062F \u0627\u0636\u0627\u0641\u0647\u200C\u06A9\u0627\u0631", 5: "\u062E\u0631\u0648\u062C \u0627\u0636\u0627\u0641\u0647\u200C\u06A9\u0627\u0631" };
function zkPairs(punches) {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  const clean = [];
  const sec = (ts) => {
    const [h, m, s] = ts.slice(11, 19).split(":").map(Number);
    return h * 3600 + m * 60 + (s || 0);
  };
  for (const p of sorted) if (!clean.length || sec(p.ts) - sec(clean[clean.length - 1].ts) >= 60) clean.push(p);
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    const a = clean[i];
    const b = clean[i + 1];
    out.push({ in: a.ts.slice(11, 16), out: b ? b.ts.slice(11, 16) : null, inDevice: a.device_name || null, outDevice: b?.device_name || null });
  }
  return out;
}
export {
  J2 as J,
  LEAVE_KINDS,
  WEEKDAYS,
  ZK_PUNCH,
  checkLocation,
  dashboard,
  dayRow,
  daysBetween,
  distanceMeters,
  expectedMinutes,
  fmt,
  hm,
  isJDate,
  leaveUsage,
  mins,
  normJ,
  nowHM,
  performance,
  shiftWindow,
  toG,
  toJ,
  todayJ,
  validateRequest,
  weekday,
  zkPairs
};
