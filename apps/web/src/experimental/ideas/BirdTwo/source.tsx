import { useEffect, useRef } from "react";

const SAMPLES = [{"x":1.62,"y":-0.28,"layer":"outline","edgeIndex":0,"order":0},{"x":1.452,"y":-0.268,"layer":"outline","edgeIndex":0,"order":1},{"x":1.284,"y":-0.256,"layer":"outline","edgeIndex":0,"order":2},{"x":1.116,"y":-0.24400000000000002,"layer":"outline","edgeIndex":0,"order":3},{"x":0.948,"y":-0.232,"layer":"outline","edgeIndex":0,"order":4},{"x":0.78,"y":-0.22,"layer":"outline","edgeIndex":0,"order":5},{"x":0.52,"y":-0.42,"layer":"outline","edgeIndex":1,"order":6},{"x":0.28,"y":-0.3,"layer":"outline","edgeIndex":2,"order":7},{"x":0.16,"y":-0.2,"layer":"outline","edgeIndex":3,"order":8},{"x":0.07,"y":-0.39,"layer":"outline","edgeIndex":4,"order":9},{"x":-0.01999999999999999,"y":-0.58,"layer":"outline","edgeIndex":4,"order":10},{"x":-0.18,"y":-0.88,"layer":"outline","edgeIndex":5,"order":11},{"x":-0.22,"y":-1.12,"layer":"outline","edgeIndex":6,"order":12},{"x":-0.32,"y":-0.9733333333333334,"layer":"outline","edgeIndex":7,"order":13},{"x":-0.42000000000000004,"y":-0.8266666666666668,"layer":"outline","edgeIndex":7,"order":14},{"x":-0.52,"y":-0.68,"layer":"outline","edgeIndex":7,"order":15},{"x":-0.43333333333333335,"y":-0.5133333333333334,"layer":"outline","edgeIndex":8,"order":16},{"x":-0.3466666666666667,"y":-0.34666666666666673,"layer":"outline","edgeIndex":8,"order":17},{"x":-0.26,"y":-0.18000000000000005,"layer":"outline","edgeIndex":8,"order":18},{"x":-0.48,"y":-0.04000000000000001,"layer":"outline","edgeIndex":9,"order":19},{"x":-0.6799999999999999,"y":-0.07999999999999999,"layer":"outline","edgeIndex":10,"order":20},{"x":-0.88,"y":-0.12,"layer":"outline","edgeIndex":10,"order":21},{"x":-1.06,"y":-0.006666666666666682,"layer":"outline","edgeIndex":11,"order":22},{"x":-1.24,"y":0.10666666666666663,"layer":"outline","edgeIndex":11,"order":23},{"x":-1.42,"y":0.21999999999999997,"layer":"outline","edgeIndex":11,"order":24},{"x":-1.2,"y":0.29,"layer":"outline","edgeIndex":12,"order":25},{"x":-0.98,"y":0.36,"layer":"outline","edgeIndex":12,"order":26},{"x":-0.78,"y":0.26,"layer":"outline","edgeIndex":13,"order":27},{"x":-0.58,"y":0.16,"layer":"outline","edgeIndex":13,"order":28},{"x":-0.36,"y":0.2,"layer":"outline","edgeIndex":14,"order":29},{"x":-0.020000000000000018,"y":0.28,"layer":"outline","edgeIndex":15,"order":30},{"x":0.28,"y":0.16,"layer":"outline","edgeIndex":16,"order":31},{"x":0.58,"y":0.1,"layer":"outline","edgeIndex":17,"order":32},{"x":0.8,"y":-0.06,"layer":"outline","edgeIndex":18,"order":33},{"x":0.9640000000000001,"y":-0.10400000000000001,"layer":"outline","edgeIndex":19,"order":34},{"x":1.1280000000000001,"y":-0.14800000000000002,"layer":"outline","edgeIndex":19,"order":35},{"x":1.292,"y":-0.192,"layer":"outline","edgeIndex":19,"order":36},{"x":1.4560000000000002,"y":-0.23600000000000004,"layer":"outline","edgeIndex":19,"order":37},{"x":1.62,"y":-0.28,"layer":"outline","edgeIndex":19,"order":38},{"x":0.78,"y":-0.22,"layer":"wire","edgeIndex":20,"order":39},{"x":0.54,"y":-0.16,"layer":"wire","edgeIndex":20,"order":40},{"x":0.8,"y":-0.06,"layer":"wire","edgeIndex":21,"order":41},{"x":0.54,"y":-0.16,"layer":"wire","edgeIndex":22,"order":42},{"x":0.5,"y":-0.01999999999999999,"layer":"wire","edgeIndex":22,"order":43},{"x":0.8,"y":-0.06,"layer":"wire","edgeIndex":23,"order":44},{"x":0.5,"y":-0.02,"layer":"wire","edgeIndex":24,"order":45},{"x":0.58,"y":0.1,"layer":"wire","edgeIndex":24,"order":46},{"x":0.52,"y":-0.42,"layer":"wire","edgeIndex":25,"order":47},{"x":0.54,"y":-0.15999999999999998,"layer":"wire","edgeIndex":25,"order":48},{"x":0.28,"y":-0.3,"layer":"wire","edgeIndex":26,"order":49},{"x":0.54,"y":-0.16,"layer":"wire","edgeIndex":26,"order":50},{"x":0.35000000000000003,"y":-0.18,"layer":"wire","edgeIndex":27,"order":51},{"x":0.16000000000000003,"y":-0.2,"layer":"wire","edgeIndex":27,"order":52},{"x":0.54,"y":-0.16,"layer":"wire","edgeIndex":28,"order":53},{"x":0.36,"y":-0.08,"layer":"wire","edgeIndex":28,"order":54},{"x":0.18,"y":0,"layer":"wire","edgeIndex":28,"order":55},{"x":0.5,"y":-0.02,"layer":"wire","edgeIndex":29,"order":56},{"x":0.18,"y":0,"layer":"wire","edgeIndex":29,"order":57},{"x":0.28,"y":0.16,"layer":"wire","edgeIndex":30,"order":58},{"x":0.16,"y":-0.2,"layer":"wire","edgeIndex":31,"order":59},{"x":0.18,"y":0,"layer":"wire","edgeIndex":31,"order":60},{"x":0.16,"y":-0.2,"layer":"wire","edgeIndex":32,"order":61},{"x":-0.05000000000000002,"y":-0.19,"layer":"wire","edgeIndex":32,"order":62},{"x":-0.26,"y":-0.18,"layer":"wire","edgeIndex":32,"order":63},{"x":-0.48,"y":-0.04000000000000001,"layer":"wire","edgeIndex":33,"order":64},{"x":0.18,"y":0,"layer":"wire","edgeIndex":34,"order":65},{"x":0.015000000000000013,"y":-0.01,"layer":"wire","edgeIndex":34,"order":66},{"x":-0.14999999999999997,"y":-0.02,"layer":"wire","edgeIndex":34,"order":67},{"x":-0.31499999999999995,"y":-0.03,"layer":"wire","edgeIndex":34,"order":68},{"x":-0.4799999999999999,"y":-0.04,"layer":"wire","edgeIndex":34,"order":69},{"x":0.18,"y":0,"layer":"wire","edgeIndex":35,"order":70},{"x":0,"y":0.06666666666666667,"layer":"wire","edgeIndex":35,"order":71},{"x":-0.18,"y":0.13333333333333333,"layer":"wire","edgeIndex":35,"order":72},{"x":-0.36000000000000004,"y":0.2,"layer":"wire","edgeIndex":35,"order":73},{"x":-0.02,"y":-0.58,"layer":"wire","edgeIndex":36,"order":74},{"x":-0.14,"y":-0.38,"layer":"wire","edgeIndex":36,"order":75},{"x":-0.26,"y":-0.18,"layer":"wire","edgeIndex":36,"order":76},{"x":-0.18,"y":-0.88,"layer":"wire","edgeIndex":37,"order":77},{"x":-0.2,"y":-0.7050000000000001,"layer":"wire","edgeIndex":37,"order":78},{"x":-0.22,"y":-0.53,"layer":"wire","edgeIndex":37,"order":79},{"x":-0.24,"y":-0.3550000000000001,"layer":"wire","edgeIndex":37,"order":80},{"x":-0.26,"y":-0.18000000000000005,"layer":"wire","edgeIndex":37,"order":81},{"x":-0.18,"y":-0.88,"layer":"wire","edgeIndex":38,"order":82},{"x":-0.35,"y":-0.78,"layer":"wire","edgeIndex":38,"order":83},{"x":-0.52,"y":-0.68,"layer":"wire","edgeIndex":38,"order":84},{"x":-0.48,"y":-0.04,"layer":"wire","edgeIndex":39,"order":85},{"x":-0.58,"y":0.16,"layer":"wire","edgeIndex":39,"order":86},{"x":0.28,"y":-0.3,"layer":"wire","edgeIndex":40,"order":87},{"x":0.16,"y":-0.2,"layer":"wire","edgeIndex":40,"order":88},{"x":0.58,"y":0.1,"layer":"wire","edgeIndex":41,"order":89},{"x":0.28,"y":0.16,"layer":"wire","edgeIndex":41,"order":90},{"x":0.28,"y":-0.3,"layer":"complete","edgeIndex":42,"order":91},{"x":0.2585714285714286,"y":-0.32,"layer":"complete","edgeIndex":42,"order":92},{"x":0.23714285714285716,"y":-0.33999999999999997,"layer":"complete","edgeIndex":42,"order":93},{"x":0.21571428571428575,"y":-0.36,"layer":"complete","edgeIndex":42,"order":94},{"x":0.19428571428571428,"y":-0.38,"layer":"complete","edgeIndex":42,"order":95},{"x":0.17285714285714288,"y":-0.39999999999999997,"layer":"complete","edgeIndex":42,"order":96},{"x":0.15142857142857144,"y":-0.42,"layer":"complete","edgeIndex":42,"order":97},{"x":0.13,"y":-0.43999999999999995,"layer":"complete","edgeIndex":42,"order":98},{"x":0.10857142857142857,"y":-0.45999999999999996,"layer":"complete","edgeIndex":42,"order":99},{"x":0.08714285714285713,"y":-0.48,"layer":"complete","edgeIndex":42,"order":100},{"x":0.0657142857142857,"y":-0.5,"layer":"complete","edgeIndex":42,"order":101},{"x":0.04428571428571429,"y":-0.52,"layer":"complete","edgeIndex":42,"order":102},{"x":0.022857142857142854,"y":-0.5399999999999999,"layer":"complete","edgeIndex":42,"order":103},{"x":0.0014285714285713902,"y":-0.56,"layer":"complete","edgeIndex":42,"order":104},{"x":-0.020000000000000018,"y":-0.58,"layer":"complete","edgeIndex":42,"order":105},{"x":0.28,"y":0.16,"layer":"complete","edgeIndex":43,"order":106},{"x":0.25272727272727274,"y":0.17090909090909093,"layer":"complete","edgeIndex":43,"order":107},{"x":0.22545454545454546,"y":0.18181818181818182,"layer":"complete","edgeIndex":43,"order":108},{"x":0.1981818181818182,"y":0.19272727272727275,"layer":"complete","edgeIndex":43,"order":109},{"x":0.1709090909090909,"y":0.20363636363636364,"layer":"complete","edgeIndex":43,"order":110},{"x":0.14363636363636365,"y":0.21454545454545457,"layer":"complete","edgeIndex":43,"order":111},{"x":0.11636363636363639,"y":0.22545454545454546,"layer":"complete","edgeIndex":43,"order":112},{"x":0.08909090909090908,"y":0.2363636363636364,"layer":"complete","edgeIndex":43,"order":113},{"x":0.0618181818181818,"y":0.2472727272727273,"layer":"complete","edgeIndex":43,"order":114},{"x":0.03454545454545452,"y":0.2581818181818182,"layer":"complete","edgeIndex":43,"order":115},{"x":0.007272727272727264,"y":0.2690909090909091,"layer":"complete","edgeIndex":43,"order":116},{"x":-0.020000000000000018,"y":0.28,"layer":"complete","edgeIndex":43,"order":117},{"x":-0.18,"y":-0.88,"layer":"complete","edgeIndex":44,"order":118},{"x":-0.185,"y":-0.91,"layer":"complete","edgeIndex":44,"order":119},{"x":-0.19,"y":-0.9400000000000001,"layer":"complete","edgeIndex":44,"order":120},{"x":-0.195,"y":-0.9700000000000001,"layer":"complete","edgeIndex":44,"order":121},{"x":-0.2,"y":-1,"layer":"complete","edgeIndex":44,"order":122},{"x":-0.205,"y":-1.03,"layer":"complete","edgeIndex":44,"order":123},{"x":-0.21,"y":-1.06,"layer":"complete","edgeIndex":44,"order":124},{"x":-0.215,"y":-1.09,"layer":"complete","edgeIndex":44,"order":125},{"x":-0.22,"y":-1.12,"layer":"complete","edgeIndex":44,"order":126},{"x":-0.23666666666666666,"y":-1.0955555555555556,"layer":"complete","edgeIndex":45,"order":127},{"x":-0.25333333333333335,"y":-1.0711111111111111,"layer":"complete","edgeIndex":45,"order":128},{"x":-0.27,"y":-1.0466666666666669,"layer":"complete","edgeIndex":45,"order":129},{"x":-0.2866666666666667,"y":-1.0222222222222224,"layer":"complete","edgeIndex":45,"order":130},{"x":-0.30333333333333334,"y":-0.9977777777777779,"layer":"complete","edgeIndex":45,"order":131},{"x":-0.32,"y":-0.9733333333333334,"layer":"complete","edgeIndex":45,"order":132},{"x":-0.33666666666666667,"y":-0.948888888888889,"layer":"complete","edgeIndex":45,"order":133},{"x":-0.3533333333333334,"y":-0.9244444444444445,"layer":"complete","edgeIndex":45,"order":134},{"x":-0.37,"y":-0.9000000000000001,"layer":"complete","edgeIndex":45,"order":135},{"x":-0.3866666666666667,"y":-0.8755555555555556,"layer":"complete","edgeIndex":45,"order":136},{"x":-0.4033333333333334,"y":-0.8511111111111112,"layer":"complete","edgeIndex":45,"order":137},{"x":-0.42000000000000004,"y":-0.8266666666666668,"layer":"complete","edgeIndex":45,"order":138},{"x":-0.4366666666666667,"y":-0.8022222222222223,"layer":"complete","edgeIndex":45,"order":139},{"x":-0.45333333333333337,"y":-0.7777777777777779,"layer":"complete","edgeIndex":45,"order":140},{"x":-0.4700000000000001,"y":-0.7533333333333334,"layer":"complete","edgeIndex":45,"order":141},{"x":-0.4866666666666667,"y":-0.7288888888888889,"layer":"complete","edgeIndex":45,"order":142},{"x":-0.5033333333333334,"y":-0.7044444444444444,"layer":"complete","edgeIndex":45,"order":143},{"x":-0.52,"y":-0.68,"layer":"complete","edgeIndex":45,"order":144}];
const EDGES = [{"a":{"x":1.62,"y":-0.28},"b":{"x":0.78,"y":-0.22},"layer":"outline"},{"a":{"x":0.78,"y":-0.22},"b":{"x":0.52,"y":-0.42},"layer":"outline"},{"a":{"x":0.52,"y":-0.42},"b":{"x":0.28,"y":-0.3},"layer":"outline"},{"a":{"x":0.28,"y":-0.3},"b":{"x":0.16,"y":-0.2},"layer":"outline"},{"a":{"x":0.16,"y":-0.2},"b":{"x":-0.02,"y":-0.58},"layer":"outline"},{"a":{"x":-0.02,"y":-0.58},"b":{"x":-0.18,"y":-0.88},"layer":"outline"},{"a":{"x":-0.18,"y":-0.88},"b":{"x":-0.22,"y":-1.12},"layer":"outline"},{"a":{"x":-0.22,"y":-1.12},"b":{"x":-0.52,"y":-0.68},"layer":"outline"},{"a":{"x":-0.52,"y":-0.68},"b":{"x":-0.26,"y":-0.18},"layer":"outline"},{"a":{"x":-0.26,"y":-0.18},"b":{"x":-0.48,"y":-0.04},"layer":"outline"},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-0.88,"y":-0.12},"layer":"outline"},{"a":{"x":-0.88,"y":-0.12},"b":{"x":-1.42,"y":0.22},"layer":"outline"},{"a":{"x":-1.42,"y":0.22},"b":{"x":-0.98,"y":0.36},"layer":"outline"},{"a":{"x":-0.98,"y":0.36},"b":{"x":-0.58,"y":0.16},"layer":"outline"},{"a":{"x":-0.58,"y":0.16},"b":{"x":-0.36,"y":0.2},"layer":"outline"},{"a":{"x":-0.36,"y":0.2},"b":{"x":-0.02,"y":0.28},"layer":"outline"},{"a":{"x":-0.02,"y":0.28},"b":{"x":0.28,"y":0.16},"layer":"outline"},{"a":{"x":0.28,"y":0.16},"b":{"x":0.58,"y":0.1},"layer":"outline"},{"a":{"x":0.58,"y":0.1},"b":{"x":0.8,"y":-0.06},"layer":"outline"},{"a":{"x":0.8,"y":-0.06},"b":{"x":1.62,"y":-0.28},"layer":"outline"},{"a":{"x":0.78,"y":-0.22},"b":{"x":0.54,"y":-0.16},"layer":"wire"},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.8,"y":-0.06},"layer":"wire"},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.5,"y":-0.02},"layer":"wire"},{"a":{"x":0.5,"y":-0.02},"b":{"x":0.8,"y":-0.06},"layer":"wire"},{"a":{"x":0.5,"y":-0.02},"b":{"x":0.58,"y":0.1},"layer":"wire"},{"a":{"x":0.52,"y":-0.42},"b":{"x":0.54,"y":-0.16},"layer":"wire"},{"a":{"x":0.28,"y":-0.3},"b":{"x":0.54,"y":-0.16},"layer":"wire"},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.16,"y":-0.2},"layer":"wire"},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.18,"y":0},"layer":"wire"},{"a":{"x":0.5,"y":-0.02},"b":{"x":0.18,"y":0},"layer":"wire"},{"a":{"x":0.18,"y":0},"b":{"x":0.28,"y":0.16},"layer":"wire"},{"a":{"x":0.16,"y":-0.2},"b":{"x":0.18,"y":0},"layer":"wire"},{"a":{"x":0.16,"y":-0.2},"b":{"x":-0.26,"y":-0.18},"layer":"wire"},{"a":{"x":-0.26,"y":-0.18},"b":{"x":-0.48,"y":-0.04},"layer":"wire"},{"a":{"x":0.18,"y":0},"b":{"x":-0.48,"y":-0.04},"layer":"wire"},{"a":{"x":0.18,"y":0},"b":{"x":-0.36,"y":0.2},"layer":"wire"},{"a":{"x":-0.02,"y":-0.58},"b":{"x":-0.26,"y":-0.18},"layer":"wire"},{"a":{"x":-0.18,"y":-0.88},"b":{"x":-0.26,"y":-0.18},"layer":"wire"},{"a":{"x":-0.18,"y":-0.88},"b":{"x":-0.52,"y":-0.68},"layer":"wire"},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-0.58,"y":0.16},"layer":"wire"},{"a":{"x":0.28,"y":-0.3},"b":{"x":0.16,"y":-0.2},"layer":"wire"},{"a":{"x":0.58,"y":0.1},"b":{"x":0.28,"y":0.16},"layer":"wire"},{"a":{"x":0.28,"y":-0.3},"b":{"x":-0.02,"y":-0.58},"layer":"complete"},{"a":{"x":0.28,"y":0.16},"b":{"x":-0.02,"y":0.28},"layer":"complete"},{"a":{"x":-0.18,"y":-0.88},"b":{"x":-0.22,"y":-1.12},"layer":"complete"},{"a":{"x":-0.22,"y":-1.12},"b":{"x":-0.52,"y":-0.68},"layer":"complete"}];
const RINGS = [[{"x":1.62,"y":-0.28},{"x":0.78,"y":-0.22},{"x":0.52,"y":-0.42},{"x":0.28,"y":-0.3},{"x":0.16,"y":-0.2},{"x":-0.02,"y":-0.58},{"x":-0.18,"y":-0.88},{"x":-0.22,"y":-1.12},{"x":-0.52,"y":-0.68},{"x":-0.26,"y":-0.18},{"x":-0.48,"y":-0.04},{"x":-0.88,"y":-0.12},{"x":-1.42,"y":0.22},{"x":-0.98,"y":0.36},{"x":-0.58,"y":0.16},{"x":-0.36,"y":0.2},{"x":-0.02,"y":0.28},{"x":0.28,"y":0.16},{"x":0.58,"y":0.1},{"x":0.8,"y":-0.06}]];
const FACETS = [{"a":{"x":1.62,"y":-0.28},"b":{"x":0.78,"y":-0.22},"c":{"x":0.54,"y":-0.16},"shade":0.96},{"a":{"x":1.62,"y":-0.28},"b":{"x":0.54,"y":-0.16},"c":{"x":0.5,"y":-0.02},"shade":0.74},{"a":{"x":1.62,"y":-0.28},"b":{"x":0.5,"y":-0.02},"c":{"x":0.8,"y":-0.06},"shade":0.46},{"a":{"x":0.78,"y":-0.22},"b":{"x":0.52,"y":-0.42},"c":{"x":0.54,"y":-0.16},"shade":0.9},{"a":{"x":0.52,"y":-0.42},"b":{"x":0.28,"y":-0.3},"c":{"x":0.54,"y":-0.16},"shade":0.82},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.28,"y":-0.3},"c":{"x":0.16,"y":-0.2},"shade":0.7},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.16,"y":-0.2},"c":{"x":0.18,"y":0},"shade":0.62},{"a":{"x":0.54,"y":-0.16},"b":{"x":0.5,"y":-0.02},"c":{"x":0.18,"y":0},"shade":0.54},{"a":{"x":0.5,"y":-0.02},"b":{"x":0.58,"y":0.1},"c":{"x":0.18,"y":0},"shade":0.38},{"a":{"x":0.5,"y":-0.02},"b":{"x":0.8,"y":-0.06},"c":{"x":0.58,"y":0.1},"shade":0.3},{"a":{"x":0.58,"y":0.1},"b":{"x":0.28,"y":0.16},"c":{"x":0.18,"y":0},"shade":0.44},{"a":{"x":0.28,"y":0.16},"b":{"x":-0.02,"y":0.28},"c":{"x":0.18,"y":0},"shade":0.5},{"a":{"x":-0.02,"y":0.28},"b":{"x":-0.36,"y":0.2},"c":{"x":0.18,"y":0},"shade":0.34},{"a":{"x":-0.02,"y":-0.58},"b":{"x":-0.18,"y":-0.88},"c":{"x":-0.26,"y":-0.18},"shade":0.78},{"a":{"x":-0.18,"y":-0.88},"b":{"x":-0.22,"y":-1.12},"c":{"x":-0.52,"y":-0.68},"shade":0.92},{"a":{"x":-0.18,"y":-0.88},"b":{"x":-0.52,"y":-0.68},"c":{"x":-0.26,"y":-0.18},"shade":0.56},{"a":{"x":0.16,"y":-0.2},"b":{"x":-0.26,"y":-0.18},"c":{"x":0.18,"y":0},"shade":0.48},{"a":{"x":-0.26,"y":-0.18},"b":{"x":-0.48,"y":-0.04},"c":{"x":0.18,"y":0},"shade":0.4},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-0.36,"y":0.2},"c":{"x":0.18,"y":0},"shade":0.28},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-0.58,"y":0.16},"c":{"x":-0.36,"y":0.2},"shade":0.22},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-0.88,"y":-0.12},"c":{"x":-1.42,"y":0.22},"shade":0.64},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-1.42,"y":0.22},"c":{"x":-0.98,"y":0.36},"shade":0.3},{"a":{"x":-0.48,"y":-0.04},"b":{"x":-0.98,"y":0.36},"c":{"x":-0.58,"y":0.16},"shade":0.2},{"a":{"x":0.28,"y":-0.3},"b":{"x":0.16,"y":-0.2},"c":{"x":-0.26,"y":-0.18},"shade":0.52},{"a":{"x":0.28,"y":-0.3},"b":{"x":0.16,"y":-0.2},"c":{"x":-0.02,"y":-0.58},"shade":0.84},{"a":{"x":0.78,"y":-0.22},"b":{"x":0.54,"y":-0.16},"c":{"x":0.5,"y":-0.02},"shade":0.8}];
const SLIDERS = {"formationSpeed":39,"detail":93,"color":42};
const ORIGIN = {"x":0.5426702281655786,"y":0.5605310132253527};

export function Example({ sliders = SLIDERS, progress = 1 }: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speed = sliders.formationSpeed ?? 39;
  const detail = sliders.detail ?? 93;
  const hue = Math.round(((sliders.color ?? 42) / 100) * 360);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.36;
    const originPx = { x: width * ORIGIN.x, y: height * ORIGIN.y };
    const taut = Math.min(1, Math.max(0, speed / 100));
    const density = Math.min(1, Math.max(0, detail / 100));
    const stride = Math.max(1, Math.round(1 + (1 - density) * 4));
    const samples = SAMPLES.filter((_, index) => index % stride === 0);
    const showBody = density > 0.28;
    const showWires = density > 0.22;
    const showComplete = density > 0.48;
    const showFacets = density > 0.36;
    const count = Math.max(samples.length, 1);
    const travel = 0.4 - taut * 0.26;
    const amount = Math.min(1, Math.max(0, progress));
    const project = (point: { x: number; y: number }) => ({
      x: cx + point.x * scale,
      y: cy + point.y * scale,
    });
    const localOf = (index: number) => {
      if (amount <= 0) return 0;
      if (amount >= 1) return 1;
      const launch = (index / Math.max(count - 1, 1)) * (1 - travel);
      return Math.min(1, Math.max(0, (amount - launch) / travel));
    };
    const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
    const mix = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => {
      const e = ease(t);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    };
    const hsl = (sat: number, light: number, alpha = 1) =>
      alpha >= 1
        ? `hsl(${hue} ${sat}% ${light}%)`
        : `hsl(${hue} ${sat}% ${light}% / ${alpha})`;

    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const bodyReveal = ease(Math.max(0, (amount - 0.36) / 0.28));
    if (showBody && bodyReveal > 0.02) {
      ctx.fillStyle = hsl(40, 24, 0.92 * bodyReveal * (0.18 + density * 0.82));
      for (const ring of RINGS) {
        ctx.beginPath();
        ring.forEach((point, index) => {
          const p = project(point);
          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }
    }

    if (showFacets && FACETS.length) {
      FACETS.forEach((facet) => {
        const reveal = ease(Math.max(0, (amount - 0.48) / 0.2)) * density;
        if (reveal < 0.02) return;
        const light = 14 + facet.shade * 28;
        ctx.fillStyle = hsl(34 + facet.shade * 20, light, (0.18 + facet.shade * 0.34) * reveal);
        ctx.beginPath();
        const pa = project(facet.a);
        const pb = project(facet.b);
        const pc = project(facet.c);
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.fill();
      });
    }

    const coverage = EDGES.map(() => 0);
    const coverageCount = EDGES.map(() => 0);
    samples.forEach((sample, index) => {
      const local = localOf(index);
      coverage[sample.edgeIndex] = (coverage[sample.edgeIndex] ?? 0) + local;
      coverageCount[sample.edgeIndex] =
        (coverageCount[sample.edgeIndex] ?? 0) + 1;
    });

    const weight = 2.05 - density * 0.85;
    EDGES.forEach((edge, index) => {
      if (edge.layer === "wire" && !showWires) return;
      if (edge.layer === "complete" && !showComplete) return;
      const n = coverageCount[index];
      if (!n) return;
      const cover = (coverage[index] ?? 0) / n;
      if (cover < 0.04) return;
      const from = mix(originPx, project(edge.a), cover);
      const to = mix(originPx, project(edge.b), cover);
      ctx.strokeStyle = hsl(edge.layer === "outline" ? 40 : 34, 26, 0.28 + cover * 0.5);
      ctx.lineWidth = (edge.layer === "outline" ? 1.35 : 1) * weight;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

  }, [progress, speed, hue, detail]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Bird two"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
