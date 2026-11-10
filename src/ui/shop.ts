import { ABILITIES, type AbilityInfo, type AbilitySlot } from '../config/abilities';
import { type SaveData, buy } from '../core/save';

/**
 * The ability shop: movement on the left, utility on the right. Everything is
 * always visible; what you cannot afford yet is simply not buyable.
 */
export class Shop {
  readonly el: HTMLDivElement;
  private readonly bank: HTMLElement;
  private readonly columns: Record<AbilitySlot, HTMLElement>;

  constructor(
    parent: HTMLElement,
    private readonly save: SaveData,
    private readonly onChange: () => void,
    onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay shop hidden';
    this.el.innerHTML = `
      <h3>Abilities</h3>
      <div class="hint bank"></div>
      <div class="hint">One movement and one utility ability can be equipped. Every level can be finished without any.</div>
      <div class="shop-columns">
        <div><h4>Movement</h4><div class="shop-list" data-slot="movement"></div></div>
        <div><h4>Utility</h4><div class="shop-list" data-slot="utility"></div></div>
      </div>
      <div class="buttons"><button type="button" class="close primary">Back</button></div>`;
    this.bank = this.el.querySelector('.bank')!;
    this.columns = {
      movement: this.el.querySelector('[data-slot="movement"]')!,
      utility: this.el.querySelector('[data-slot="utility"]')!,
    };
    this.el.querySelector('.close')!.addEventListener('click', onClose);
    parent.appendChild(this.el);
  }

  show(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
    if (visible) this.render();
  }

  private render(): void {
    this.bank.textContent = `Bank: ${this.save.points.toLocaleString('en-US')} points`;
    for (const slot of ['movement', 'utility'] as const) {
      this.columns[slot].replaceChildren(
        ...ABILITIES.filter((a) => a.slot === slot).map((a) => this.card(a)),
      );
    }
  }

  private card(a: AbilityInfo): HTMLElement {
    const owned = this.save.owned.includes(a.id);
    const equipped = this.save.equipped[a.slot] === a.id;
    const card = document.createElement('div');
    card.className = 'shop-card' + (equipped ? ' equipped' : '') + (owned ? ' owned' : '');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = a.name;
    const how = document.createElement('div');
    how.className = 'control';
    how.textContent = a.control;
    const text = document.createElement('div');
    text.className = 'desc';
    text.textContent = a.description;
    const button = document.createElement('button');
    button.type = 'button';
    if (!owned) {
      button.textContent = `Buy  ${a.cost.toLocaleString('en-US')}`;
      button.disabled = this.save.points < a.cost;
      button.addEventListener('click', () => {
        if (buy(this.save, a.id, a.cost)) this.changed();
      });
    } else {
      button.textContent = equipped ? 'Unequip' : 'Equip';
      button.addEventListener('click', () => {
        this.save.equipped[a.slot] = equipped ? null : a.id;
        this.changed();
      });
    }
    card.append(name, how, text, button);
    return card;
  }

  private changed(): void {
    this.onChange();
    this.render();
  }
}
