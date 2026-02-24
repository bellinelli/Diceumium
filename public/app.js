const socket = io();

const DICE_TYPES = [2, 4, 6, 8, 10, 12, 20, 100];

const state = {
  inParty: false,
  partyCode: null,
  playerName: null,
  isMaster: false,
  forcedValue: null,
  customization: {
    color: '#a855f7',
    animStyle: 'spin',
    critFx: true
  }
};

const el = {
  themeToggle: document.getElementById('themeToggle'),
  createParty: document.getElementById('createParty'),
  joinParty: document.getElementById('joinParty'),
  playerName: document.getElementById('playerName'),
  partyCode: document.getElementById('partyCode'),
  partyStatus: document.getElementById('partyStatus'),
  members: document.getElementById('members'),
  diceGrid: document.getElementById('diceGrid'),
  diceAnimation: document.getElementById('diceAnimation'),
  rollMode: document.getElementById('rollMode'),
  bonusValue: document.getElementById('bonusValue'),
  visibility: document.getElementById('visibility'),
  rollNote: document.getElementById('rollNote'),
  log: document.getElementById('log'),
  cheatPanel: document.getElementById('cheatPanel'),
  forcedValue: document.getElementById('forcedValue'),
  clearForced: document.getElementById('clearForced'),
  diceColor: document.getElementById('diceColor'),
  animStyle: document.getElementById('animStyle'),
  critFx: document.getElementById('critFx')
};

function createDiceButtons() {
  DICE_TYPES.forEach((faces) => {
    const btn = document.createElement('button');
    btn.className = 'dice-btn';
    btn.textContent = `d${faces}`;
    btn.addEventListener('click', () => rollDice(faces));
    el.diceGrid.appendChild(btn);
  });
}

function oneRoll(faces) {
  const forced = Number(state.forcedValue);
  if (Number.isFinite(forced) && forced > 0) {
    return Math.min(forced, faces);
  }
  return Math.ceil(Math.random() * faces);
}

function rollDice(faces) {
  if (!state.inParty) {
    alert('Entre em uma party primeiro.');
    return;
  }

  const mode = el.rollMode.value;
  const bonus = Number(el.bonusValue.value) || 0;

  const rolls = mode === 'normal' ? [oneRoll(faces)] : [oneRoll(faces), oneRoll(faces)];
  const selected = mode === 'advantage' ? Math.max(...rolls) : mode === 'disadvantage' ? Math.min(...rolls) : rolls[0];
  const total = selected + bonus;

  const critical = selected === faces;

  animateDice(total, critical);

  socket.emit('roll:send', {
    dice: `d${faces}`,
    value: total,
    baseValue: selected,
    rolls,
    mode,
    bonus,
    max: faces,
    critical,
    visibility: el.visibility.value,
    note: el.rollNote.value
  });
}

function animateDice(value, critical) {
  el.diceAnimation.textContent = value;
  el.diceAnimation.style.background = state.customization.color;

  el.diceAnimation.classList.remove('anim-spin', 'anim-bounce', 'anim-shake', 'critical');
  void el.diceAnimation.offsetWidth;
  el.diceAnimation.classList.add(`anim-${state.customization.animStyle}`);

  if (critical && state.customization.critFx) {
    el.diceAnimation.classList.add('critical');
    setTimeout(() => el.diceAnimation.classList.remove('critical'), 1000);
  }
}

function addLog(message, type = 'normal') {
  const li = document.createElement('li');
  li.textContent = message;
  if (type === 'private') li.style.opacity = '0.75';
  if (type === 'critical') li.style.color = '#f43f5e';
  el.log.prepend(li);
}

function updateMembers(members) {
  el.members.innerHTML = '';
  const ul = document.createElement('ul');
  members.forEach((m) => {
    const li = document.createElement('li');
    li.textContent = m.name;
    if (m.isMaster) li.classList.add('member-master');
    ul.appendChild(li);
  });
  el.members.appendChild(ul);
}

function validateIdentity() {
  const name = el.playerName.value.trim();
  const partyCode = el.partyCode.value.trim().toUpperCase();
  if (!name || !partyCode) {
    alert('Informe nome e código da party.');
    return null;
  }
  state.playerName = name;
  state.partyCode = partyCode;
  return { name, partyCode };
}

el.createParty.addEventListener('click', () => {
  const payload = validateIdentity();
  if (!payload) return;
  socket.emit('party:create', payload);
});

el.joinParty.addEventListener('click', () => {
  const payload = validateIdentity();
  if (!payload) return;
  socket.emit('party:join', payload);
});

el.themeToggle.addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme');
  document.body.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
});

el.clearForced.addEventListener('click', () => {
  state.forcedValue = null;
  el.forcedValue.value = '';
});

el.forcedValue.addEventListener('input', () => {
  const value = Number(el.forcedValue.value);
  state.forcedValue = Number.isFinite(value) && value > 0 ? value : null;
});

el.diceColor.addEventListener('input', () => {
  state.customization.color = el.diceColor.value;
});

el.animStyle.addEventListener('change', () => {
  state.customization.animStyle = el.animStyle.value;
});

el.critFx.addEventListener('change', () => {
  state.customization.critFx = el.critFx.checked;
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === '*') {
    el.cheatPanel.classList.toggle('hidden');
  }
});

socket.on('party:joined', ({ partyCode, youAreMaster, members }) => {
  state.inParty = true;
  state.isMaster = youAreMaster;
  state.partyCode = partyCode;
  el.partyStatus.textContent = `Na party ${partyCode} como ${youAreMaster ? 'Mestre' : 'Jogador'}.`;
  updateMembers(members);
  addLog(`Conectado à party ${partyCode}.`);
});

socket.on('party:members', (members) => {
  updateMembers(members);
});

socket.on('party:error', (message) => {
  alert(message);
});

socket.on('roll:new', (roll) => {
  const visibilityLabel = roll.visibility === 'public'
    ? 'pública'
    : roll.visibility === 'hidden'
      ? 'oculta'
      : 'só mestre';

  const modeLabel = roll.mode === 'advantage'
    ? 'vantagem'
    : roll.mode === 'disadvantage'
      ? 'desvantagem'
      : 'normal';

  const rollsLabel = Array.isArray(roll.rolls) ? ` [${roll.rolls.join(', ')}]` : '';
  const bonusLabel = roll.bonus ? ` + bônus ${roll.bonus}` : '';

  const text = `${roll.from}${roll.isMaster ? ' 👑' : ''} rolou ${roll.dice} (${modeLabel})${rollsLabel} => ${roll.value}${bonusLabel} [${visibilityLabel}]${roll.note ? ` — ${roll.note}` : ''}`;

  if (roll.privateReason) {
    addLog(text, roll.critical ? 'critical' : 'private');
  } else {
    addLog(text, roll.critical ? 'critical' : 'normal');
  }

  if (roll.critical && state.customization.critFx) {
    animateDice(roll.value, true);
  }
});

createDiceButtons();
