import React from 'react';
import styled from 'styled-components';
import { customTheme } from '../../styles';

const Container = styled('div')(({ theme }) => ({
	width: '100%',
	height: '100%',
	backgroundColor: customTheme.grey2,
	borderRadius: '5px',
	overflow: 'hidden',
}));

const Bar = styled('div')<{ progress: number }>(({ theme, progress }) => ({
	width: `${progress}%`,
	height: '20px',
	backgroundColor: customTheme.secondary,
	transition: 'width 0.5s ease',
}));

export function ProgressBar({ progress }: { progress: number }) {
	return (
		<Container>
			<Bar progress={progress} />
		</Container>
	);
}
