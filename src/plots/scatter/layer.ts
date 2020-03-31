import { deepMix, isNil, get, has, find } from '@antv/util';
import { registerPlotType } from '../../base/global';
import { LayerConfig } from '../../base/layer';
import ViewLayer, { ViewConfig } from '../../base/view-layer';
import { getGeom } from '../../geoms/factory';
import { ITimeAxis, IValueAxis, DataItem, GraphicStyle } from '../../interface/config';
import { extractScale } from '../../util/scale';
import Quadrant, { QuadrantConfig } from './components/quadrant';
import Trendline, { TrendlineConfig } from './components/trendline';
import * as EventParser from './event';
import { getComponent } from '../../components/factory';
import './theme';

const G2_GEOM_MAP = {
  scatter: 'point',
};

const PLOT_GEOM_MAP = {
  point: 'point',
};

export interface PointViewConfig extends ViewConfig {
  /** 散点样式 */
  pointStyle?: GraphicStyle | ((...args: any) => GraphicStyle);
  /** 颜色字段 */
  colorField?: string | string[];
  /** x 轴配置 */
  xAxis?: ITimeAxis | IValueAxis;
  /** y 轴配置 */
  yAxis?: ITimeAxis | IValueAxis;
  quadrant?: QuadrantConfig;
  trendline?: TrendlineConfig;
}

export interface ScatterViewConfig extends PointViewConfig {
  /** 散点大小 */
  pointSize?: number | any;
}

export interface ScatterLayerConfig extends ScatterViewConfig, LayerConfig {}

export default class ScatterLayer<T extends ScatterLayerConfig = ScatterLayerConfig> extends ViewLayer<T> {
  public static getDefaultOptions(): any {
    return deepMix({}, super.getDefaultOptions(), {
      pointSize: 4,
      pointStyle: {
        lineWidth: 1,
        strokeOpacity: 1,
        fillOpacity: 0.95,
        stroke: '#fff',
      },
      xAxis: {
        nice: true,
        grid: {
          visible: true,
        },
        line: {
          visible: true,
        },
      },
      yAxis: {
        nice: true,
        grid: {
          visible: true,
        },
        line: {
          visible: true,
        },
      },
      tooltip: {
        visible: true,
        // false 会造成 tooltip 只能显示一条数据，true 会造成 tooltip 在空白区域也会显示
        shared: null,
        showTitle: false,
        showMarkers: false,
        showCrosshairs: false,
      },
      label: {
        visible: false,
      },
      shape: 'circle',
    });
  }

  public type: string = 'scatter';
  public points: any;
  protected quadrant: Quadrant;
  protected trendline: Trendline;

  public afterRender() {
    super.afterRender();
    if (this.quadrant) {
      this.quadrant.destroy();
    }
    if (this.trendline) {
      this.trendline.destroy();
    }
    if (this.options.quadrant && this.options.quadrant.visible) {
      this.quadrant = new Quadrant({
        view: this.view,
        plotOptions: this.options,
        ...this.options.quadrant,
      });
      this.quadrant.render();
    }
    if (this.options.trendline && this.options.trendline.visible) {
      this.trendline = new Trendline({
        view: this.view,
        plotOptions: this.options,
        ...this.options.trendline,
      });
      this.trendline.render();
    }
  }

  public destroy() {
    if (this.quadrant) {
      this.quadrant.destroy();
      this.quadrant = null;
    }
    if (this.trendline) {
      this.trendline.destroy();
      this.trendline = null;
    }
    super.destroy();
  }

  private isValidLinearValue(value) {
    if (isNil(value)) {
      return false;
    } else if (Number.isNaN(Number(value))) {
      return false;
    }
    return true;
  }

  protected processData(data?: DataItem[]): DataItem[] | undefined {
    const { xField, yField } = this.options;
    const xAxisType = get(this.options, ['xAxis', 'type'], 'linear');
    const yAxisType = get(this.options, ['yAxis', 'type'], 'linear');
    if (xAxisType && yAxisType) {
      const fiteredData = data
        .filter((item) => {
          if (xAxisType === 'linear' && !this.isValidLinearValue(item[xField])) {
            return false;
          }
          if (yAxisType === 'linear' && !this.isValidLinearValue(item[yField])) {
            return false;
          }
          return true;
        })
        .map((item) => {
          return {
            ...item,
            [xField]: xAxisType === 'linear' ? Number(item[xField]) : String(item[xField]),
            [yField]: yAxisType === 'linear' ? Number(item[yField]) : String(item[yField]),
          };
        });
      return fiteredData;
    }

    return data;
  }

  protected geometryParser(dim, type) {
    if (dim === 'g2') {
      return G2_GEOM_MAP[type];
    }
    return PLOT_GEOM_MAP[type];
  }

  protected scale() {
    const props = this.options;
    const scales = {};
    /** 配置x-scale */
    scales[props.xField] = {};
    if (has(props, 'xAxis')) {
      extractScale(scales[props.xField], props.xAxis);
    }
    /** 配置y-scale */
    scales[props.yField] = {};
    if (has(props, 'yAxis')) {
      extractScale(scales[props.yField], props.yAxis);
    }
    const timeLineInteraction = find(props.interactions, (interaction) => {
      return interaction.type === 'timeline';
    });
    if (timeLineInteraction && get(timeLineInteraction, 'cfg.key')) {
      const keyField = timeLineInteraction.cfg.key;
      if (scales[keyField]) {
        scales[keyField].key = true;
      } else {
        scales[keyField] = { key: true };
      }
    }
    this.setConfig('scales', scales);
    super.scale();
  }

  protected coord() {}

  protected annotation() {}

  protected addGeometry() {
    const points = getGeom('point', 'circle', {
      plot: this,
    });
    this.points = points;
    if (this.options.tooltip && this.options.tooltip.visible) {
      const { showTitle, titleField } = this.options.tooltip;
      this.extractTooltip();
      this.setConfig('tooltip', {
        showTitle,
        title: showTitle ? titleField : undefined,
        ...this.options.tooltip,
      } as any);
    }
    if (this.options.label) {
      this.label();
    }
    this.setConfig('geometry', points);
  }

  protected label() {
    const props = this.options;

    if (props.label.visible === false) {
      if (this.points) {
        this.points.label = false;
      }
      return;
    }

    const label = getComponent('label', {
      fields: props.label.field ? [props.label.field] : [props.yField],
      ...props.label,
      plot: this,
    });

    if (this.points) {
      this.points.label = label;
    }
  }

  protected animation() {
    super.animation();
    const props = this.options;
    if (props.animation === false) {
      /** 关闭动画 */
      this.points.animate = false;
    }
  }

  protected parseEvents(eventParser) {
    // 气泡图继承散点图时，会存在 eventParser
    super.parseEvents(eventParser || EventParser);
  }

  protected extractTooltip() {
    this.points.tooltip = {};
    const tooltipOptions: any = this.options.tooltip;
    if (tooltipOptions.fields) {
      this.points.tooltip.fields = tooltipOptions.fields;
    } else {
      this.points.tooltip.fields = [this.options.xField, this.options.yField];
    }
    if (tooltipOptions.formatter) {
      this.points.tooltip.callback = tooltipOptions.formatter;
      if (this.options.colorField) {
        this.points.tooltip.fields.push(this.options.colorField);
      }
    }
  }
}

registerPlotType('scatter', ScatterLayer);
