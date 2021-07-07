var DaylightMap, updateDateTime;

DaylightMap = function() {
	class DaylightMap {
		constructor(svg, date, options = {}) {
			if (
				!(
					typeof SunCalc !== "undefined" &&
					SunCalc !== null &&
					(typeof $ !== "undefined" && $ !== null) &&
					(typeof d3 !== "undefined" && d3 !== null)
				)
			) {
				throw new Error("Unmet dependency (requires d3.js, jQuery, SunCalc)");
			}
			if (!svg) {
				throw new TypeError(
					"DaylightMap must be instantiated with a valid SVG"
				);
			}
			this.options = {
				tickDur: options.tickDur || 400,
				shadowOpacity: options.shadowOpacity || 0.16,
				bgColorLeft: options.bgColorLeft || "#eee",
				bgColorRight: options.bgColorRight || "#eee",
				lightsColor: options.lightsColor || "#FFBEA0",
				lightsOpacity: options.lightsOpacity || 1,
				sunOpacity: options.sunOpacity || 0.11
			};
			this.PRECISION_LAT = 1; // How many latitudinal degrees per point when checking solar position.
			this.PRECISION_LNG = 10; // How may longitudial degrees per sunrise / sunset path point.
			this.MAP_WIDTH = options.width || 1100;
			this.MAP_HEIGHT = this.MAP_WIDTH / 2;
			this.SCALAR_X = this.MAP_WIDTH / 360;
			this.SCALAR_Y = this.MAP_HEIGHT / 180;
			this.PROJECTION_SCALE = this.MAP_WIDTH / 6.25;
			this.WORLD_PATHS_URL = "world-110m.json";
			this.CITIES_DATA_URL = "cities-200000.json";
			this.MESSAGES_DATA_URL = "messages-cc.json";
			this.svg = svg;
			this.isAnimating = false;
			this.cities = [];
			this.messages = [];
			this.animInterval = null;
			this.currDate = date || new Date();
		}

		colorLuminance(hex, lum = 0) {
			var c, i, rgb;
			c = null;
			i = 0;
			rgb = "#";
			hex = String(hex).replace(/[^0-9a-f]/gi, "");
			if (hex.length < 6) {
				hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
			}
			while (i < 3) {
				c = parseInt(hex.substr(i * 2, 2), 16);
				c = Math.round(Math.min(Math.max(0, c + c * lum), 255)).toString(16);
				rgb += ("00" + c).substr(c.length);
				i++;
			}
			return rgb;
		}

		isDaylight(obj) {
			return obj.altitude > 0;
		}

		isNorthSun() {
			return this.isDaylight(SunCalc.getPosition(this.currDate, 90, 0));
		}

		getSunriseSunsetLatitude(lng, northSun) {
			var delta, endLat, lat, startLat;
			if (northSun) {
				startLat = -90;
				endLat = 90;
				delta = this.PRECISION_LAT;
			} else {
				startLat = 90;
				endLat = -90;
				delta = -this.PRECISION_LAT;
			}
			lat = startLat;
			while (lat !== endLat) {
				if (this.isDaylight(SunCalc.getPosition(this.currDate, lat, lng))) {
					return lat;
				}
				lat += delta;
			}
			return lat;
		}

		getAllSunPositionsAtLng(lng) {
			var alt, lat, peak, result;
			lat = -90;
			peak = 0;
			result = [];
			while (lat < 90) {
				alt = SunCalc.getPosition(this.currDate, lat, lng).altitude;
				if (alt > peak) {
					peak = alt;
					result = [peak, lat];
				}
				lat += this.PRECISION_LNG;
			}
			return result;
		}

		getSunPosition() {
			var alt, coords, lng, peak, result;
			lng = -180;
			coords = [];
			peak = 0;
			while (lng < 180) {
				alt = this.getAllSunPositionsAtLng(lng);
				if (alt[0] > peak) {
					peak = alt[0];
					result = [alt[1], lng];
				}
				lng += this.PRECISION_LAT;
			}
			return this.coordToXY(result);
		}

		getAllSunriseSunsetCoords(northSun) {
			var coords, lng;
			lng = -180;
			coords = [];
			while (lng < 180) {
				coords.push([this.getSunriseSunsetLatitude(lng, northSun), lng]);
				lng += this.PRECISION_LNG;
			}
			// Add the last point to the map.
			coords.push([this.getSunriseSunsetLatitude(180, northSun), 180]);
			return coords;
		}

		coordToXY(coord) {
			var x, y;
			x = (coord[1] + 180) * this.SCALAR_X;
			y = this.MAP_HEIGHT - (coord[0] + 90) * this.SCALAR_Y;
			return {
				x: x,
				y: y
			};
		}

		getCityOpacity(coord) {
			if (SunCalc.getPosition(this.currDate, coord[0], coord[1]).altitude > 0) {
				return 0;
			}
			return 1;
		}

		getCityRadius(population) {
			if (population < 200000) {
				return 0.3;
			} else if (population < 500000) {
				return 0.4;
			} else if (population < 100000) {
				return 0.5;
			} else if (population < 2000000) {
				return 0.6;
			} else if (population < 4000000) {
				return 0.8;
			} else {
				return 1;
			}
		}

		getPath(northSun) {
			var coords, path;
			path = [];
			coords = this.getAllSunriseSunsetCoords(northSun);
			coords.forEach(val => {
				return path.push(this.coordToXY(val));
			});
			return path;
		}

		getPathString(northSun) {
			var path, pathStr, yStart;
			if (!northSun) {
				yStart = 0;
			} else {
				yStart = this.MAP_HEIGHT;
			}
			pathStr = `M 0 ${yStart}`;
			path = this.getPath(northSun);
			pathStr += this.lineFunction(path);
			// Close the path back to the origin.
			pathStr += ` L ${this.MAP_WIDTH}, ${yStart} `;
			pathStr += ` L 0, ${yStart} `;
			return pathStr;
		}

		createDefs() {
			d3.select(this.svg)
				.append("defs")
				.append("linearGradient")
				.attr("id", "gradient")
				.attr("x1", "0%")
				.attr("y1", "0%")
				.attr("x2", "100%")
				.attr("y2", "0%");
			d3.select("#gradient")
				.append("stop")
				.attr("offset", "0%")
				.attr("stop-color", this.options.bgColorLeft);
			d3.select("#gradient")
				.append("stop")
				.attr("offset", "100%")
				.attr("stop-color", this.options.bgColorRight);
			d3.select(this.svg)
				.select("defs")
				.append("linearGradient")
				.attr("id", "landGradient")
				.attr("x1", "0%")
				.attr("y1", "0%")
				.attr("x2", "100%")
				.attr("y2", "0%");
			d3.select("#landGradient")
				.append("stop")
				.attr("offset", "0%")
				.attr(
					"stop-color",
					this.colorLuminance(this.options.bgColorLeft, -0.2)
				);
			d3.select("#landGradient")
				.append("stop")
				.attr("offset", "100%")
				.attr(
					"stop-color",
					this.colorLuminance(this.options.bgColorRight, -0.2)
				);
			d3.select(this.svg)
				.select("defs")
				.append("radialGradient")
				.attr("id", "radialGradient");
			d3.select("#radialGradient")
				.append("stop")
				.attr("offset", "0%")
				.attr("stop-opacity", this.options.sunOpacity)
				.attr("stop-color", "rgb(255, 255, 255)");
			return d3
				.select("#radialGradient")
				.append("stop")
				.attr("offset", "100%")
				.attr("stop-opacity", 0)
				.attr("stop-color", "rgb(255, 255, 255)");
		}

		drawSVG() {
			return d3
				.select(this.svg)
				.attr("width", this.MAP_WIDTH)
				.attr("height", this.MAP_HEIGHT)
				.attr("viewBox", `0 0 ${this.MAP_WIDTH} ${this.MAP_HEIGHT}`)
				.append("rect")
				.attr("width", this.MAP_WIDTH)
				.attr("height", this.MAP_HEIGHT)
				.attr("fill", "url(#gradient)");
		}

		drawSun() {
			var xy;
			xy = this.getSunPosition();
			return d3
				.select(this.svg)
				.append("circle")
				.attr("cx", xy.x)
				.attr("cy", xy.y)
				.attr("id", "sun")
				.attr("r", 150)
				.attr("opacity", 1)
				.attr("fill", "url(#radialGradient)");
		}

		drawPath() {
			var path;
			path = this.getPathString(this.isNorthSun());
			return d3
				.select(this.svg)
				.append("path")
				.attr("id", "nightPath")
				.attr("fill", "rgb(0,0,0)")
				.attr("fill-opacity", this.options.shadowOpacity)
				.attr("d", path);
		}

		drawLand() {
			return $.get(this.WORLD_PATHS_URL, data => {
				var projection, worldPath;
				projection = d3.geo
					.equirectangular()
					.scale(this.PROJECTION_SCALE)
					.translate([this.MAP_WIDTH / 2, this.MAP_HEIGHT / 2])
					.precision(0.1);
				worldPath = d3.geo.path().projection(projection);
				d3.select(this.svg)
					.append("path")
					.attr("id", "land")
					.attr("fill", "url(#landGradient)")
					.datum(topojson.feature(data, data.objects.land))
					.attr("d", worldPath);
				// Asynchronous so re-order the elements here.
				return this.shuffleElements();
			});
		}

		weighted_random(options) {
			var i;
			var weights = [];

			for (i = 0; i < options.length; i++) {
				weights[i] = parseInt(options[i][2]) + (weights[i - 1] || 0);
			}
			var random = Math.random() * weights[weights.length - 1];
			for (i = 0; i < weights.length; i++) {
				if (weights[i] > random) {
					break;
				}
			}
			return [parseFloat(options[i][0]), parseFloat(options[i][1])];
		}

		drawMessages() {
			return $.get(this.CITIES_DATA_URL, city => {
				var cityMap = {};
				city
					.map(x => {
						return [x[5], x[2], x[3], x[0]];
					})
					.forEach(y => {
						if (cityMap[y[0]] === undefined) {
							cityMap[y[0]] = [];
						}
						cityMap[y[0]].push([y[1], y[2], y[3]]);
					});

				return fetch(this.MESSAGES_DATA_URL)
					.then(response => response.json())
					.then(msg => {

						var tmp = msg.map(x => {
							var ts = x[0],
								cc = x[1],
								z = this.weighted_random(cityMap[cc]);
								return [ts, z, cc]
						}).forEach((val, i) => {
							var coords = [parseFloat(val[1][0]), parseFloat(val[1][1])],
								xy = this.coordToXY(coords),
								id = `msg-${val[0]}-${val[1]}`.replaceAll(',', '').replaceAll('.', '');
							d3.select(this.svg)
								.append("circle")
								.attr("cx", xy.x)
								.attr("cy", xy.y)
								.attr("id", id)
								.attr("r", 3)
								.attr("opacity", 0)
								.attr("fill", `hsl(${Math.random() * 256}, 80%, 50%)`);

							return this.messages.push({
								title: id,
								country: val[2],
								latlng: coords,
								date: moment(parseFloat(val[0]) * 1000),
								xy: xy,
								id: id,
								opacity: 0
							});
						})
				});

			});
		}

		drawCities() {
			return $.get(this.CITIES_DATA_URL, data => {
				return data.forEach((val, i) => {
					var coords, id, opacity, radius, xy;
					coords = [parseFloat(val[2]), parseFloat(val[3])];
					xy = this.coordToXY(coords);
					id = `city${i}`;
					opacity = this.getCityOpacity(coords);
					radius = this.getCityRadius(val[0]) * 2;
					d3.select(this.svg)
						.append("circle")
						.attr("cx", xy.x)
						.attr("cy", xy.y)
						.attr("id", id)
						.attr("r", radius)
						.attr("opacity", opacity * this.options.lightsOpacity)
						.attr("fill", this.options.lightsColor);
					return this.cities.push({
						title: val[1],
						country: val[5],
						latlng: coords,
						xy: xy,
						population: parseInt(val[0]),
						id: id,
						opacity: opacity
					});
				});
			});
		}

		searchCities(str) {
			var cities;
			cities = _.filter(this.cities, function(val) {
				return val.title.toLowerCase().indexOf(str) === 0;
			});
			cities = _.sortBy(cities, function(val) {
				return val.population;
			});
			return cities.reverse();
		}

		redrawSun(animate) {
			var curX, xy;
			xy = this.getSunPosition();
			curX = parseInt(d3.select("#sun").attr("cx"));
			if (animate && Math.abs(xy.x - curX) < this.MAP_WIDTH * 0.8) {
				return d3
					.select("#sun")
					.transition()
					.duration(this.options.tickDur)
					.ease("linear")
					.attr("cx", xy.x)
					.attr("cy", xy.y);
			} else {
				return d3
					.select("#sun")
					.attr("cx", xy.x)
					.attr("cy", xy.y);
			}
		}

		redrawCities() {
			var k;
			k = 0;
			return this.cities.forEach((val, i) => {
				var opacity;
				opacity = this.getCityOpacity(val.latlng);
				if (val.opacity !== opacity) {
					this.cities[i].opacity = opacity;
					k++;
					return d3
						.select(`#${val.id}`)
						.transition()
						.duration(this.options.tickDur * 2)
						.attr("opacity", this.options.lightsOpacity * opacity);
				}
			});
		}

		redrawMessages() {
			var k;
			k = 0;
			var z0 = 5000000, z1 = 10000000;
			console.log(this.messages.filter(x => { (moment(this.currDate) - x.date) > 0 }).length)
			return this.messages.forEach((val, i) => {
				var opacity = 0;
				var diff = moment(this.currDate) - val.date
				if (diff > 0 && diff < z0) {
					opacity = 0.5;
				} else if (diff > z0 && diff < z1) {
					opacity = 0.5 - ((diff - (z0)) / (z1 - z0))/2;
				}
				if (val.opacity !== opacity) {
					this.messages[i].opacity = opacity;
					k++;
					return d3
						.select(`#${val.id}`)
						.transition()
						.duration(this.options.tickDur * 2)
						.attr("opacity", this.options.lightsOpacity * opacity);
				}
			});
		}

		redrawPath(animate) {
			var nightPath, path;
			path = this.getPathString(this.isNorthSun(this.currDate));
			nightPath = d3.select("#nightPath");
			if (animate) {
				return nightPath
					.transition()
					.duration(this.options.tickDur)
					.ease("linear")
					.attr("d", path);
			} else {
				return nightPath.attr("d", path);
			}
		}

		redrawAll(increment = 15, animate = true) {
			this.currDate.setMinutes(this.currDate.getMinutes() + increment);
			this.redrawPath(animate);
			this.redrawSun(animate);
			this.redrawMessages();
			return this.redrawCities();
		}

		drawAll() {
			this.drawSVG();
			this.createDefs();
			this.drawLand();
			this.drawPath();
			this.drawSun();
			this.drawMessages();
			return this.drawCities();
		}

		shuffleElements() {
			$("#land").insertBefore("#nightPath");
			return $("#sun").insertBefore("#land");
		}

		animate(increment = 0) {
			if (!this.isAnimating) {
				this.isAnimating = true;
				return (this.animInterval = setInterval(() => {
					this.redrawAll(increment);
					return $(document).trigger("update-date-time", this.currDate);
				}, this.options.tickDur));
			}
		}

		stop() {
			this.isAnimating = false;
			return clearInterval(this.animInterval);
		}

		init() {
			this.drawAll();
			return setInterval(() => {
				if (this.isAnimating) {
					return;
				}
				this.redrawAll(1, false);
				return $(document).trigger("update-date-time", this.currDate);
			}, 60000);
		}
	}

	DaylightMap.prototype.lineFunction = d3.svg
		.line()
		.x(function(d) {
			return d.x;
		})
		.y(function(d) {
			return d.y;
		})
		.interpolate("basis");

	return DaylightMap;
}.call(this);

updateDateTime = function(date) {
	// tz = date.toString().match(/\(([A-Za-z\s].*)\)/)[1]
	$(".curr-time")
		.find("span")
		.html(moment(date).format("HH:mm"));
	return $(".curr-date")
		.find("span")
		.text(moment(date).format("DD MMM"));
};

$(document).ready(function() {
	var map, svg;
	svg = document.getElementById("daylight-map");
	map = new DaylightMap(svg, new Date("2021-02-15"));
	map.init();
	updateDateTime(map.currDate);
	$(document).on("update-date-time", function(date) {
		return updateDateTime(map.currDate);
	});
	$(".toggle-btn").on("click", function(e) {
		var $el;
		e.preventDefault();
		$el = $(this);
		return $el.toggleClass("active");
	});
	$(".js-skip").on("click", function(e) {
		var $el, animate;
		e.preventDefault();
		$el = $(this);
		animate = false;
		map.stop();
		$(".js-animate").removeClass("animating");
		if ($el.attr("data-animate")) {
			animate = true;
		}
		map.redrawAll(parseInt($(this).attr("data-skip")), animate);
		return updateDateTime(map.currDate);
	});
	map.animate(20);
});
