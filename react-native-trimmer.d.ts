declare module 'react-native-trimmer' {
  import * as React from 'react';

  export type TrimmerHandleChange = {
    leftPosition: number;
    rightPosition: number;
  };

  export type TrimmerProps = {
    totalDuration: number;
    trimmerLeftHandlePosition: number;
    trimmerRightHandlePosition: number;
    onHandleChange?: (value: TrimmerHandleChange) => void;
    minimumTrimDuration?: number;
    maxTrimDuration?: number;
    maximumZoomLevel?: number;
    zoomMultiplier?: number;
    initialZoomValue?: number;
    scaleInOnInit?: boolean;
    scaleInOnInitType?: 'trim-duration' | 'max-duration' | string;
    scrubberPosition?: number | null;
    onScrubbingComplete?: (value: number) => void;
    onLeftHandlePressIn?: () => void;
    onRightHandlePressIn?: () => void;
    onScrubberPressIn?: () => void;
    tintColor?: string;
    markerColor?: string;
    trackBackgroundColor?: string;
    trackBorderColor?: string;
    scrubberColor?: string;
    showScrollIndicator?: boolean;
    centerOnLayout?: boolean;
  };

  const Trimmer: React.ComponentType<TrimmerProps>;

  export default Trimmer;
}
