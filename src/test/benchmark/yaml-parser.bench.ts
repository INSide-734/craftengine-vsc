/**
 * YAML 解析器性能测试
 *
 * 测试 YAML 解析在不同场景下的性能表现，使用贴近真实 CraftEngine 配置的数据格式：
 * - 物品配置（items）
 * - 模板配置（templates）
 * - 翻译配置（translations）
 * - 分类配置（categories）
 * - 复杂模型定义
 *
 * 注意：使用同步的 yaml 库进行基准测试，以获得准确的性能数据
 */
import { describe, bench } from 'vitest';
import * as yaml from 'yaml';
import { defaultBenchOptions, fastBenchOptions } from './bench-options';

// ========================================
// CraftEngine 风格测试数据生成函数
// ========================================

/**
 * 生成物品配置 YAML（使用 template + arguments 模式）
 *
 * 使用 template 时，物品属性由模板定义，通过 arguments 传递参数
 */
function generateItemsWithTemplate(itemCount: number): string {
    const items: string[] = [];
    const templates = ['default:model/generated', 'default:model/handheld', 'default:model/2_layer_generated'];
    const itemNames = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'jade', 'onyx', 'pearl', 'opal', 'diamond'];

    for (let i = 0; i < itemCount; i++) {
        const template = templates[i % templates.length];
        const itemName = itemNames[i % itemNames.length];
        const suffix = i >= itemNames.length ? `_${Math.floor(i / itemNames.length)}` : '';
        items.push(`
  ${itemName}${suffix}:
    template: ${template}
    arguments:
      model: minecraft:item/${itemName}${suffix}
      texture: minecraft:item/${itemName}${suffix}`);
    }

    return `items:${items.join('')}`;
}

/**
 * 生成完整物品配置 YAML（包含 data、lore、components）
 *
 * 完整配置包含 material、custom-model-data、category、data（item-name/lore/components）
 */
function generateFullItemConfig(itemCount: number): string {
    const items: string[] = [];
    const materials = ['DIAMOND_SWORD', 'NETHERITE_AXE', 'IRON_PICKAXE', 'GOLDEN_HELMET', 'LEATHER_CHESTPLATE'];
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const itemNames = [
        'jade_sword',
        'phoenix_staff',
        'dragon_blade',
        'thunder_axe',
        'frost_pickaxe',
        'flame_helmet',
        'shadow_armor',
        'light_boots',
        'nature_ring',
        'void_amulet',
    ];

    for (let i = 0; i < itemCount; i++) {
        const material = materials[i % materials.length];
        const rarity = rarities[i % rarities.length];
        const itemName = itemNames[i % itemNames.length];
        const suffix = i >= itemNames.length ? `_${Math.floor(i / itemNames.length)}` : '';
        items.push(`
  default:${itemName}${suffix}:
    material: ${material}
    custom-model-data: ${2000 + i}
    category: default:weapons
    data:
      item-name: "<gradient:green:aqua><i18n:item.${itemName}></gradient>"
      lore:
        - "<i18n:lore.rarity.${rarity}>"
        - ""
        - "<green><i18n:lore.damage></green>"
        - "<gray>A mystical weapon forged in ancient flames</gray>"
      components:
        minecraft:max_stack_size: 1
        minecraft:enchantment_glint_override: true
        minecraft:attribute_modifiers:
          modifiers:
            - type: minecraft:attack_damage
              amount: ${5 + (i % 10)}
              operation: add_value
              slot: mainhand`);
    }

    return `items:${items.join('')}`;
}

/**
 * 生成版本条件配置 YAML
 *
 * 使用 $$>=version 格式进行版本条件配置
 */
function generateVersionConditionalItems(itemCount: number): string {
    const items: string[] = [];
    const itemNames = ['topaz_trident', 'crystal_bow', 'ender_staff', 'void_blade', 'thunder_hammer'];

    for (let i = 0; i < itemCount; i++) {
        const itemName = itemNames[i % itemNames.length];
        const suffix = i >= itemNames.length ? `_${Math.floor(i / itemNames.length)}` : '';
        items.push(`
  default:${itemName}${suffix}:
    material: DIAMOND_SWORD
    custom-model-data: ${3000 + i}
    data:
      item-name: "<gold><i18n:item.${itemName}></gold>"
    $$>=1.21.4:
      model:
        type: minecraft:model
        path: minecraft:item/${itemName}${suffix}
    $$1.20.1~1.21.3:
      legacy-model:
        path: minecraft:item/legacy_${itemName}${suffix}`);
    }

    return `items:${items.join('')}`;
}

/**
 * 生成 2D 模型模板配置
 *
 * 模板使用 ${param} 格式的参数占位符
 */
function generateModelTemplates(templateCount: number): string {
    const templates: string[] = [];
    const templateTypes = ['generated', 'handheld', 'layered', 'overlay', 'animated'];

    for (let i = 0; i < templateCount; i++) {
        const typeName = templateTypes[i % templateTypes.length];
        const suffix = i >= templateTypes.length ? `_${Math.floor(i / templateTypes.length)}` : '';
        templates.push(`
  default:model/${typeName}${suffix}:
    type: minecraft:model
    path: \${model}
    generation:
      parent: minecraft:item/generated
      textures:
        layer0: \${texture}`);
    }

    return `templates#models#2d:${templates.join('')}`;
}

/**
 * 生成复杂条件模型模板（如弓、弩等动态模型）
 */
function generateComplexModelTemplates(templateCount: number): string {
    const templates: string[] = [];

    for (let i = 0; i < templateCount; i++) {
        templates.push(`
  default:model/bow_${i}:
    type: minecraft:condition
    property: minecraft:using_item
    on-false:
      type: minecraft:model
      path: \${model}
      generation:
        parent: minecraft:item/bow
        textures:
          layer0: \${texture}
    on-true:
      type: minecraft:range_dispatch
      property: minecraft:bow/pull
      entries:
        - model:
            type: minecraft:model
            path: \${pulling_1_model}
            generation:
              parent: minecraft:item/bow_pulling_1
              textures:
                layer0: \${pulling_1_texture}
          threshold: 0.65
        - model:
            type: minecraft:model
            path: \${pulling_2_model}
            generation:
              parent: minecraft:item/bow_pulling_2
              textures:
                layer0: \${pulling_2_texture}
          threshold: 0.9
      fallback:
        type: minecraft:model
        path: \${pulling_0_model}
        generation:
          parent: minecraft:item/bow_pulling_0
          textures:
            layer0: \${pulling_0_texture}`);
    }

    return `templates#models#bow:${templates.join('')}`;
}

/**
 * 生成护甲修饰模板（select case 结构）
 */
function generateArmorTrimTemplates(templateCount: number): string {
    const templates: string[] = [];
    const trims = [
        'quartz',
        'iron',
        'netherite',
        'redstone',
        'copper',
        'gold',
        'emerald',
        'diamond',
        'lapis',
        'amethyst',
    ];

    for (let i = 0; i < templateCount; i++) {
        const cases = trims
            .map(
                (trim) => `
        - when: minecraft:${trim}
          model:
            type: minecraft:model
            path: minecraft:item/custom/armor_${i}_${trim}_trim
            generation:
              parent: minecraft:item/generated
              textures:
                layer0: minecraft:item/custom/armor_${i}
                layer1: minecraft:trims/items/helmet_trim_${trim}`,
            )
            .join('');

        templates.push(`
  default:model/armor_trim_${i}:
    type: minecraft:select
    property: minecraft:trim_material
    fallback:
      type: minecraft:model
      path: minecraft:item/custom/armor_${i}
      generation:
        parent: minecraft:item/generated
        textures:
          layer0: minecraft:item/custom/armor_${i}
    cases:${cases}`);
    }

    return `templates#models#armor:${templates.join('')}`;
}

/**
 * 生成翻译配置 YAML
 *
 * 使用真实的翻译键格式，包含物品名称、稀有度、描述等
 */
function generateTranslations(keyCount: number, languageCount: number = 4): string {
    const languages = ['en', 'zh_cn', 'zh_tw', 'ja', 'ko', 'de', 'fr', 'es'];
    const itemNames = ['jade_sword', 'phoenix_staff', 'dragon_blade', 'thunder_axe', 'frost_pickaxe'];
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const sections: string[] = [];

    for (let lang = 0; lang < Math.min(languageCount, languages.length); lang++) {
        const keys: string[] = [];
        for (let i = 0; i < keyCount; i++) {
            const itemName = itemNames[i % itemNames.length];
            const rarity = rarities[i % rarities.length];
            keys.push(`
    item.${itemName}_${i}: "${itemName.replace(/_/g, ' ')} ${i} (${languages[lang]})"
    lore.rarity.${rarity}: "${rarity.charAt(0).toUpperCase() + rarity.slice(1)}"
    lore.damage: "Damage: {damage}"
    message.welcome: "Welcome, {player}!"`);
        }
        sections.push(`
  ${languages[lang]}:${keys.join('')}`);
    }

    return `translations:${sections.join('')}`;
}

/**
 * 生成分类配置 YAML
 *
 * 分类包含名称、图标、优先级和物品列表
 */
function generateCategories(categoryCount: number, itemsPerCategory: number = 10): string {
    const categories: string[] = [];
    const categoryNames = ['weapons', 'armor', 'tools', 'magic_items', 'decorations', 'materials', 'food', 'potions'];
    const itemNames = ['jade_sword', 'phoenix_staff', 'dragon_blade', 'thunder_axe', 'frost_pickaxe'];

    for (let i = 0; i < categoryCount; i++) {
        const categoryName = categoryNames[i % categoryNames.length];
        const suffix = i >= categoryNames.length ? `_${Math.floor(i / categoryNames.length)}` : '';
        const itemList = Array.from({ length: itemsPerCategory }, (_, j) => {
            const itemName = itemNames[j % itemNames.length];
            return `      - "default:${itemName}_${i}_${j}"`;
        }).join('\n');

        categories.push(`
  default:${categoryName}${suffix}:
    name: "<gradient:gold:yellow><i18n:category.${categoryName}></gradient>"
    icon: "default:${itemNames[i % itemNames.length]}"
    priority: ${i * 10}
    list:
${itemList}`);
    }

    return `categories:${categories.join('')}`;
}

/**
 * 生成完整的 CraftEngine 配置文件（混合多种配置类型）
 */
function generateFullConfig(itemCount: number, templateCount: number, translationKeyCount: number): string {
    return `# CraftEngine Configuration File
# Generated for performance testing

${generateItemsWithTemplate(itemCount)}

${generateModelTemplates(templateCount)}

${generateTranslations(translationKeyCount, 2)}

${generateCategories(Math.ceil(itemCount / 10), 10)}`;
}

/**
 * 生成区块分隔符格式的配置
 *
 * 使用 templates#section#subsection: 格式组织模板
 */
function generateSectionedConfig(sectionCount: number): string {
    const sections: string[] = [];
    const sectionNames = ['models', 'blocks', 'settings', 'sounds', 'loot'];
    const subsections = ['2d', '3d', 'animated', 'static'];

    for (let i = 0; i < sectionCount; i++) {
        const sectionName = sectionNames[i % sectionNames.length];
        const subsection = subsections[i % subsections.length];
        sections.push(`
templates#${sectionName}#${subsection}:
  default:${sectionName}/${subsection}_model:
    type: minecraft:model
    path: \${path}
    generation:
      parent: minecraft:item/generated
      textures:
        layer0: \${texture}
  default:${sectionName}/${subsection}_variant:
    template: default:model/generated
    arguments:
      model: minecraft:item/variant_model
      texture: minecraft:item/variant_texture`);
    }

    return sections.join('\n');
}

/**
 * 生成 MiniMessage 格式丰富的配置
 *
 * 使用 MiniMessage 格式的颜色、渐变、悬停、点击事件等
 */
function generateMiniMessageRichConfig(itemCount: number): string {
    const items: string[] = [];
    const itemNames = ['legendary_sword', 'mythic_staff', 'divine_bow', 'celestial_armor', 'abyssal_ring'];

    for (let i = 0; i < itemCount; i++) {
        const itemName = itemNames[i % itemNames.length];
        const suffix = i >= itemNames.length ? `_${Math.floor(i / itemNames.length)}` : '';
        items.push(`
  default:${itemName}${suffix}:
    material: DIAMOND_SWORD
    custom-model-data: ${4000 + i}
    data:
      item-name: "<!i><gradient:#FF5555:#55FF55:#5555FF><i18n:item.${itemName}></gradient>"
      lore:
        - "<hover:show_text:'<gray>Click for details</gray>'><yellow> <i18n:lore.rarity.legendary></yellow></hover>"
        - ""
        - "<rainbow>✦ Special Effect ✦</rainbow>"
        - "<gradient:red:gold><bold><i18n:lore.damage></bold></gradient>"
        - "<click:run_command:'/item info ${itemName}'><underlined><aqua>Click for more</aqua></underlined></click>"
        - ""
        - "<dark_gray>ID: default:${itemName}${suffix}</dark_gray>"`);
    }

    return `items:${items.join('')}`;
}

describe('YamlParser Performance - CraftEngine Style', () => {
    // 预生成测试数据
    const smallItems = generateItemsWithTemplate(10);
    const mediumItems = generateItemsWithTemplate(50);
    const largeItems = generateItemsWithTemplate(100);

    const fullItemsSmall = generateFullItemConfig(10);
    const fullItemsMedium = generateFullItemConfig(30);
    const fullItemsLarge = generateFullItemConfig(50);

    const versionedItems = generateVersionConditionalItems(20);

    const modelTemplates10 = generateModelTemplates(10);
    const modelTemplates30 = generateModelTemplates(30);
    const complexModels10 = generateComplexModelTemplates(10);
    const armorTrims5 = generateArmorTrimTemplates(5);

    const translations20 = generateTranslations(20, 4);
    const translations50 = generateTranslations(50, 4);

    const categories10 = generateCategories(10, 10);

    const fullConfigSmall = generateFullConfig(20, 10, 20);
    const fullConfigMedium = generateFullConfig(50, 20, 40);
    const fullConfigLarge = generateFullConfig(100, 30, 60);

    const sectionedConfig = generateSectionedConfig(20);
    const miniMessageRich = generateMiniMessageRichConfig(30);

    // ========================================
    // 物品配置解析测试
    // ========================================

    describe('Items Configuration Parsing', () => {
        bench(
            'parse 10 items (template mode)',
            () => {
                yaml.parse(smallItems);
            },
            defaultBenchOptions,
        );

        bench(
            'parse 50 items (template mode)',
            () => {
                yaml.parse(mediumItems);
            },
            defaultBenchOptions,
        );

        bench(
            'parse 100 items (template mode)',
            () => {
                yaml.parse(largeItems);
            },
            fastBenchOptions,
        );
    });

    describe('Full Item Config Parsing', () => {
        bench(
            'parse 10 items (full config with data/components)',
            () => {
                yaml.parse(fullItemsSmall);
            },
            defaultBenchOptions,
        );

        bench(
            'parse 30 items (full config)',
            () => {
                yaml.parse(fullItemsMedium);
            },
            fastBenchOptions,
        );

        bench(
            'parse 50 items (full config)',
            () => {
                yaml.parse(fullItemsLarge);
            },
            fastBenchOptions,
        );
    });

    describe('Version Conditional Items', () => {
        bench(
            'parse 20 version-conditional items',
            () => {
                yaml.parse(versionedItems);
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 模板配置解析测试
    // ========================================

    describe('Model Templates Parsing', () => {
        bench(
            'parse 10 simple model templates',
            () => {
                yaml.parse(modelTemplates10);
            },
            defaultBenchOptions,
        );

        bench(
            'parse 30 simple model templates',
            () => {
                yaml.parse(modelTemplates30);
            },
            defaultBenchOptions,
        );

        bench(
            'parse 10 complex bow-style templates',
            () => {
                yaml.parse(complexModels10);
            },
            defaultBenchOptions,
        );

        bench(
            'parse 5 armor trim templates (select/cases)',
            () => {
                yaml.parse(armorTrims5);
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 翻译配置解析测试
    // ========================================

    describe('Translations Parsing', () => {
        bench(
            'parse translations (20 keys × 4 languages)',
            () => {
                yaml.parse(translations20);
            },
            defaultBenchOptions,
        );

        bench(
            'parse translations (50 keys × 4 languages)',
            () => {
                yaml.parse(translations50);
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 分类配置解析测试
    // ========================================

    describe('Categories Parsing', () => {
        bench(
            'parse 10 categories (100 items total)',
            () => {
                yaml.parse(categories10);
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 完整配置文件解析测试
    // ========================================

    describe('Full Configuration File Parsing', () => {
        bench(
            'parse small config (20 items, 10 templates, 20 translations)',
            () => {
                yaml.parse(fullConfigSmall);
            },
            defaultBenchOptions,
        );

        bench(
            'parse medium config (50 items, 20 templates, 40 translations)',
            () => {
                yaml.parse(fullConfigMedium);
            },
            fastBenchOptions,
        );

        bench(
            'parse large config (100 items, 30 templates, 60 translations)',
            () => {
                yaml.parse(fullConfigLarge);
            },
            fastBenchOptions,
        );
    });

    // ========================================
    // 特殊格式解析测试
    // ========================================

    describe('Special Format Parsing', () => {
        bench(
            'parse sectioned config (templates#section#block format)',
            () => {
                yaml.parse(sectionedConfig);
            },
            defaultBenchOptions,
        );

        bench(
            'parse MiniMessage rich text items',
            () => {
                yaml.parse(miniMessageRich);
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // Document API 对比测试
    // ========================================

    describe('Parse vs ParseDocument Comparison', () => {
        bench(
            'yaml.parse (medium config)',
            () => {
                yaml.parse(fullConfigMedium);
            },
            defaultBenchOptions,
        );

        bench(
            'yaml.parseDocument (medium config)',
            () => {
                yaml.parseDocument(fullConfigMedium);
            },
            defaultBenchOptions,
        );

        bench(
            'yaml.parseAllDocuments (medium config)',
            () => {
                yaml.parseAllDocuments(fullConfigMedium);
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 严格模式对比测试
    // ========================================

    describe('Strict Mode Comparison', () => {
        bench(
            'parse with default options',
            () => {
                yaml.parse(fullItemsMedium);
            },
            defaultBenchOptions,
        );

        bench(
            'parse with strict schema',
            () => {
                yaml.parse(fullItemsMedium, { strict: true });
            },
            defaultBenchOptions,
        );
    });
});
