const express = require("express"); // importando o Express 
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http); // importando Socket.io
const five = require("johnny-five"); // importando o Johnny-five
const path = require('path'); // será utilizado para fazer o express reconhecer o caminho 

const port = 8080;
app.use(express.static(path.resolve(__dirname + "/../frontend"))); // atender requisições com pasta a frontend
let setPoint = null; // valor de setpoint passado pelo usuário  
let pinWasInit = false;
let u;
let iant = 0, eant = 0;
// declarando Arduino na porta ao qual está conectado

const arduino = new five.Board({ port: "COM6" });
let therm1, therm2, therm3, therm4, therm5;

// executar quando o arduino estiver pronto
arduino.on('ready', () => {
	arduino.pinMode(9, five.Pin.PWM);
	if (pinWasInit) {
		// coloca no pino 9 do Arduino o valor gerado pelo PID 
		arduino.analogWrite(9, scaleValue(generatePID(getTemp())));
	}
	io.on('connection', socket => {
		if (pinWasInit)
			startSending(socket, socket.id);
		socket.on('setPins', pins => setPins(pins));
		socket.on('changingSetPoint', newSetPoint => setSetPoint(socket, newSetPoint));
	});
	// ouvir na porta declarada 
	http.listen(port, () => {
		console.log('============ SISTEMA PRONTO ============');
		console.log(`   Abrir em: http://localhost:${port}`);
		console.log('>> ========================================');
	});
});

// retorna a temperatura media
function getTemp() {
	return (therm1.value + therm2.value +
		therm3.value + therm4.value +
		therm5.value) / 5
}

// mudar o setPoint 
function setSetPoint(socket, newSetPoint) {
	setPoint = newSetPoint;
	socket.broadcast.emit('changeSetPoint', setPoint); // enviando para todos clientes exceto o atual 
	console.log(`Set point mudado para ${setPoint}`);
}
// setar canais A0 e A1 por padrão 
function setPins(pins) {
	therm1 = new five.Sensor({ pin: pins[0], freq: 500 });
	therm2 = new five.Sensor({ pin: pins[1], freq: 500 });
	therm3 = new five.Sensor({ pin: pins[2], freq: 500 });
	therm4 = new five.Sensor({ pin: pins[3], freq: 500 });
	therm5 = new five.Sensor({ pin: pins[4], freq: 500 });
	console.log(`Canais setados: ${pins}`);
	pinWasInit = true;
}
// começa a mandar os dados para o arduino
function startSending(socket, clientId) {
	setInterval(() => {
		let media = toCelsius(therm1.value) + toCelsius(therm1.value) +
			toCelsius(therm1.value) + toCelsius(therm1.value) +
			toCelsius(therm1.value) / 5;
		u = generatePID(media, setPoint, iant, eant);
		socket.emit('controlBitValue', u);
	}, 500);
	console.log('Mandando dados para ' + clientId);
	// passar o setPoint atual para o novo usuário conectado
	socket.emit('changeSetPoint', setPoint);
	// quando receber um novo setPoint é necessário mandar o novo set para todos os clientes 
	tempSend(socket, therm1, 'newTemperature1');
	tempSend(socket, therm2, 'newTemperature2');
	tempSend(socket, therm3, 'newTemperature3');
	tempSend(socket, therm4, 'newTemperature4');
	tempSend(socket, therm5, 'newTemperature5');

	setInterval(() => socket.emit('controlBitValue', u), 400);
}
// faz os dados de um termistor começarem a ser mandados pros clientes via socket.io
function tempSend(socket, therm, socketMsg) {
	// setInterval(() => socket.emit(socketMsg, toCelsius(Math.random() * 100 + 420)), 400);
	therm.on('change', () => socket.emit(socketMsg, toCelsius(therm.value)));
}
// converte valor ADC em Celsius
function toCelsius(rawADC) {
	let temp = Math.log(((10240000 / rawADC) - 10000));
	temp = 1 / (0.001129148 + (0.000234125 * temp) + (0.0000000876741 * temp ** 3));
	temp = temp - 273.15;   // Kelvin para Celsius 
	return temp;
}
// gerar o PID
function generatePID(temp) {
	const KP = 1 / 0.6, KI = KP / 1.77, H = 7, IMAX = 5, KD = KP * 6;
	let e = temp - setPoint;
	let p = KP * e;
	let i = iant + (KI * H) * (e + eant);
	if (i > IMAX) {
		i = IMAX;
	} else if (i < - IMAX) {
		i = - IMAX;
	}
	let d = (KD / H) * (e - eant);
	let u = p + i + d;
	if (u > IMAX) {
		u = IMAX;
	} else if (u < - IMAX) {
		u = - IMAX;
	}
	eant = e;
	iant = i;
	return u;
}
// retorna correspondente do valor em outra escala  
function scaleValue(value) {
	let from = [0, 5], to = [0, 255];
	var scale = (to[1] - to[0]) / (from[1] - from[0]);
	var capped = Math.min(from[1], Math.max(from[0], value)) - from[0];
	return Math.floor(capped * scale + to[0]);
}